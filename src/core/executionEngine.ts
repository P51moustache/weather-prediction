import { DetectedEdge } from "./edgeDetector";
import { prisma } from "@/lib/prisma";

// Cache for settings to avoid DB calls on every request
let settingsCache: { city: City; mode: "paper" | "live"; loadedAt: number } | null = null;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Execution Engine
 *
 * Handles trade execution with configurable risk controls.
 * Supports paper mode (simulated) and live mode (real orders).
 */

// Supported cities for weather markets
export type City = "los_angeles" | "new_york";

// Strategy configuration
export interface StrategyConfig {
  mode: "paper" | "live";
  city: City; // Target city for weather markets
  minExpectedProfit: number; // Minimum expected $ profit per contract (e.g., 0.05 = $0.05)
  minConfidence: number; // Minimum confidence score (0-1)
  minHoursToEvent: number; // Don't trade too close to settlement
  maxHoursToEvent: number; // Don't trade too far out
  maxStakePerContract: number; // Max dollars per single contract
  maxStakePerDay: number; // Max total dollars per day
  maxExposure: number; // Max total open exposure
  maxDailyLoss: number; // Stop trading if daily loss exceeds this
  useKellyCriterion: boolean; // Use Kelly for stake sizing
  kellyFraction: number; // Fraction of Kelly to use (e.g., 0.5 = half Kelly)
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  mode: "paper",
  city: "los_angeles", // Default to LA per CLAUDE.md
  minExpectedProfit: 0.05, // $0.05 minimum expected profit
  minConfidence: 0.6,
  minHoursToEvent: 1,
  maxHoursToEvent: 72,
  maxStakePerContract: 50,
  maxStakePerDay: 500,
  maxExposure: 1000,
  maxDailyLoss: 200,
  useKellyCriterion: false,
  kellyFraction: 0.25,
};

// Position tracking
export interface Position {
  marketId: string;
  ticker: string;
  side: "YES" | "NO";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

// Order types
export interface Order {
  id: string;
  marketId: string;
  ticker: string;
  side: "YES" | "NO";
  type: "limit" | "market";
  price: number;
  quantity: number;
  status: "pending" | "filled" | "partial" | "cancelled" | "rejected";
  filledQuantity: number;
  filledPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

// Trade decision
export interface TradeDecision {
  edge: DetectedEdge;
  action: "TRADE" | "SKIP";
  reason: string;
  side?: "YES" | "NO";
  stake?: number;
  expectedValue?: number;
}

// Execution result
export interface ExecutionResult {
  success: boolean;
  order?: Order;
  error?: string;
  isPaper: boolean;
}

// Daily stats for risk management
export interface DailyStats {
  date: string;
  totalStaked: number;
  totalPnL: number;
  tradesExecuted: number;
  tradesSkipped: number;
}

/**
 * Calculate Kelly criterion stake
 */
function calculateKellyStake(
  edge: number,
  winProbability: number,
  kellyFraction: number,
  maxStake: number
): number {
  // Kelly formula: f* = (p * b - q) / b
  // where p = win probability, q = lose probability, b = odds
  // For binary contracts: b = 1 (even money effective)
  // Simplified: f* = edge / variance

  if (edge <= 0) return 0;

  // Full Kelly
  const fullKelly = edge / (1 - edge);

  // Apply fraction
  const stake = fullKelly * kellyFraction * maxStake;

  return Math.min(stake, maxStake);
}

/**
 * Execution Engine class
 */
export class ExecutionEngine {
  private config: StrategyConfig;
  private dailyStats: DailyStats;
  private positions: Map<string, Position> = new Map();

  constructor(config?: Partial<StrategyConfig>) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };
    this.dailyStats = {
      date: new Date().toISOString().split("T")[0],
      totalStaked: 0,
      totalPnL: 0,
      tradesExecuted: 0,
      tradesSkipped: 0,
    };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * Check if trading should be halted (risk controls)
   */
  private shouldHaltTrading(): { halt: boolean; reason: string } {
    // Check daily loss limit
    if (this.dailyStats.totalPnL < -this.config.maxDailyLoss) {
      return {
        halt: true,
        reason: `Daily loss limit exceeded: ${this.dailyStats.totalPnL}`,
      };
    }

    // Check daily stake limit
    if (this.dailyStats.totalStaked >= this.config.maxStakePerDay) {
      return {
        halt: true,
        reason: `Daily stake limit reached: ${this.dailyStats.totalStaked}`,
      };
    }

    // Check total exposure
    const totalExposure = Array.from(this.positions.values()).reduce(
      (sum, p) => sum + p.quantity * p.avgPrice,
      0
    );
    if (totalExposure >= this.config.maxExposure) {
      return {
        halt: true,
        reason: `Max exposure reached: ${totalExposure}`,
      };
    }

    return { halt: false, reason: "" };
  }

  /**
   * Evaluate an edge and decide whether to trade
   */
  evaluateEdge(edge: DetectedEdge): TradeDecision {
    // Check global halt conditions
    const haltCheck = this.shouldHaltTrading();
    if (haltCheck.halt) {
      return {
        edge,
        action: "SKIP",
        reason: haltCheck.reason,
      };
    }

    // Check edge meets minimum threshold
    if (edge.expectedProfit < this.config.minExpectedProfit) {
      return {
        edge,
        action: "SKIP",
        reason: `Expected profit $${edge.expectedProfit.toFixed(2)} below minimum $${this.config.minExpectedProfit.toFixed(2)}`,
      };
    }

    // Check confidence
    if (edge.confidence < this.config.minConfidence) {
      return {
        edge,
        action: "SKIP",
        reason: `Confidence ${(edge.confidence * 100).toFixed(0)}% below minimum ${(this.config.minConfidence * 100).toFixed(0)}%`,
      };
    }

    // Check time to event
    const hoursToEvent =
      (edge.eventDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursToEvent < this.config.minHoursToEvent) {
      return {
        edge,
        action: "SKIP",
        reason: `Too close to event: ${hoursToEvent.toFixed(1)} hours`,
      };
    }
    if (hoursToEvent > this.config.maxHoursToEvent) {
      return {
        edge,
        action: "SKIP",
        reason: `Too far from event: ${hoursToEvent.toFixed(1)} hours`,
      };
    }

    // Determine side based on direction
    const side: "YES" | "NO" = edge.direction === "BUY_YES" ? "YES" : "NO";
    const effectiveEdge = edge.expectedProfit;
    const winProbability =
      side === "YES" ? edge.modelProbability : 1 - edge.modelProbability;

    // Calculate stake
    let stake: number;
    if (this.config.useKellyCriterion) {
      stake = calculateKellyStake(
        effectiveEdge,
        winProbability,
        this.config.kellyFraction,
        this.config.maxStakePerContract
      );
    } else {
      // Fixed stake based on edge size
      stake = Math.min(
        effectiveEdge * 100 * 10, // $10 per 1% edge
        this.config.maxStakePerContract
      );
    }

    // Round to nearest dollar
    stake = Math.round(stake);

    if (stake < 1) {
      return {
        edge,
        action: "SKIP",
        reason: "Calculated stake too small",
      };
    }

    // Calculate expected value
    const expectedValue = stake * effectiveEdge;

    return {
      edge,
      action: "TRADE",
      reason: `${(effectiveEdge * 100).toFixed(1)}% edge with ${(edge.confidence * 100).toFixed(0)}% confidence`,
      side,
      stake,
      expectedValue,
    };
  }

  /**
   * Execute a trade (paper or live)
   */
  async executeTrade(decision: TradeDecision): Promise<ExecutionResult> {
    if (decision.action !== "TRADE" || !decision.side || !decision.stake) {
      return {
        success: false,
        error: "Invalid trade decision",
        isPaper: this.config.mode === "paper",
      };
    }

    const order: Order = {
      id: `${this.config.mode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      marketId: decision.edge.marketId,
      ticker: decision.edge.ticker,
      side: decision.side,
      type: "limit",
      price: decision.side === "YES" ? decision.edge.yesAsk : 1 - decision.edge.yesBid,
      quantity: decision.stake,
      status: "pending",
      filledQuantity: 0,
      filledPrice: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.config.mode === "paper") {
      // Simulate fill in paper mode
      order.status = "filled";
      order.filledQuantity = order.quantity;
      order.filledPrice = order.price;
      order.updatedAt = new Date();

      // Update daily stats
      this.dailyStats.totalStaked += order.quantity;
      this.dailyStats.tradesExecuted += 1;

      // Log to database
      await this.logTrade(order, decision);

      return {
        success: true,
        order,
        isPaper: true,
      };
    } else {
      // Live mode - would call Kalshi API
      // For now, return error since we don't have credentials
      return {
        success: false,
        error: "Live trading not yet implemented - configure Kalshi API credentials",
        isPaper: false,
      };
    }
  }

  /**
   * Log trade to database
   */
  private async logTrade(order: Order, decision: TradeDecision): Promise<void> {
    await prisma.systemLog.create({
      data: {
        level: "info",
        source: "execution",
        message: `${this.config.mode.toUpperCase()} ${order.side} ${order.ticker} @ ${order.price.toFixed(2)} x ${order.quantity}`,
        metadata: JSON.stringify({
          order,
          decision: {
            expectedProfit: decision.edge.expectedProfit,
            direction: decision.edge.direction,
            confidence: decision.edge.confidence,
            expectedValue: decision.expectedValue,
          },
        }),
      },
    });
  }

  /**
   * Process multiple edges and execute trades
   */
  async processEdges(edges: DetectedEdge[]): Promise<{
    decisions: TradeDecision[];
    executions: ExecutionResult[];
  }> {
    const decisions: TradeDecision[] = [];
    const executions: ExecutionResult[] = [];

    for (const edge of edges) {
      const decision = this.evaluateEdge(edge);
      decisions.push(decision);

      if (decision.action === "TRADE") {
        const result = await this.executeTrade(decision);
        executions.push(result);

        // Check if we should halt after this trade
        const haltCheck = this.shouldHaltTrading();
        if (haltCheck.halt) {
          break;
        }
      } else {
        this.dailyStats.tradesSkipped += 1;
      }
    }

    return { decisions, executions };
  }

  /**
   * Get daily statistics
   */
  getDailyStats(): DailyStats {
    return { ...this.dailyStats };
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Reset daily stats (call at start of new day)
   */
  resetDailyStats(): void {
    this.dailyStats = {
      date: new Date().toISOString().split("T")[0],
      totalStaked: 0,
      totalPnL: 0,
      tradesExecuted: 0,
      tradesSkipped: 0,
    };
  }
}

// Export singleton instance with default config
export const executionEngine = new ExecutionEngine();

/**
 * Load settings from database
 */
export async function loadSettingsFromDb(): Promise<{ city: City; mode: "paper" | "live" }> {
  // Check cache first
  if (settingsCache && Date.now() - settingsCache.loadedAt < CACHE_TTL) {
    return { city: settingsCache.city, mode: settingsCache.mode };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (settings) {
    const city = (settings.city === "new_york" ? "new_york" : "los_angeles") as City;
    const mode = (settings.mode === "live" ? "live" : "paper") as "paper" | "live";
    settingsCache = { city, mode, loadedAt: Date.now() };
    return { city, mode };
  }

  // Create default settings if not exists
  await prisma.settings.create({
    data: {
      id: "default",
      city: "los_angeles",
      mode: "paper",
    },
  });

  settingsCache = { city: "los_angeles", mode: "paper", loadedAt: Date.now() };
  return { city: "los_angeles", mode: "paper" };
}

/**
 * Save settings to database
 */
export async function saveSettingsToDb(updates: { city?: City; mode?: "paper" | "live" }): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "default" },
    update: updates,
    create: {
      id: "default",
      city: updates.city || "los_angeles",
      mode: updates.mode || "paper",
    },
  });

  // Invalidate cache
  settingsCache = null;
}
