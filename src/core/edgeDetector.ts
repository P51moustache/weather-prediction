import { NormalizedMarket, NormalizedQuote } from "@/connectors/kalshi/types";
import { BracketProbabilityResult } from "./weatherProbEngine";

/**
 * Edge Detector
 *
 * Calculates expected profit for buy-and-hold to expiration.
 * Edge = expected dollar profit per contract after Kalshi fees.
 */

// Kalshi fee structure
const KALSHI_FEE_RATE = 0.07; // 7% fee on profits (not on losses)

/**
 * Detected edge for a single market
 */
export interface DetectedEdge {
  marketId: string;
  ticker: string;
  question: string;
  bracketLow: number | null;
  bracketHigh: number | null;
  eventDate: Date;

  // Probabilities
  modelProbability: number;
  marketProbability: number;

  // Edge calculations (in dollars per contract)
  expectedProfit: number;      // Best expected $ profit (YES or NO side)
  expectedProfitYes: number;   // Expected $ if buying YES at ask
  expectedProfitNo: number;    // Expected $ if buying NO at ask

  // Confidence scoring
  confidence: number; // 0-1 score
  confidenceFactors: {
    forecastHorizon: number;
    modelAgreement: number;
    liquidityScore: number;
  };

  // Market data
  yesPrice: number;
  yesBid: number;
  yesAsk: number;
  volume: number;

  // Recommendation
  direction: "BUY_YES" | "BUY_NO" | "NO_TRADE";
  timestamp: Date;
}

/**
 * Calculate expected profit for buying YES and holding to expiration
 *
 * Cost = yesAsk
 * If win (modelProb): Net profit = (1 - yesAsk) * (1 - feeRate)
 * If lose (1 - modelProb): Loss = yesAsk
 */
function calculateExpectedProfitYes(modelProb: number, yesAsk: number): number {
  const winProfit = (1 - yesAsk) * (1 - KALSHI_FEE_RATE);
  const lossAmount = yesAsk;
  return modelProb * winProfit - (1 - modelProb) * lossAmount;
}

/**
 * Calculate expected profit for buying NO and holding to expiration
 *
 * Cost = noAsk = 1 - yesBid
 * If win (1 - modelProb): Net profit = yesBid * (1 - feeRate)
 * If lose (modelProb): Loss = noAsk
 */
function calculateExpectedProfitNo(modelProb: number, yesBid: number): number {
  const noAsk = 1 - yesBid;
  const winProfit = yesBid * (1 - KALSHI_FEE_RATE);
  const lossAmount = noAsk;
  return (1 - modelProb) * winProfit - modelProb * lossAmount;
}

/**
 * Calculate confidence score based on various factors
 */
function calculateConfidence(
  hoursToEvent: number,
  modelStdDev: number,
  volume: number
): {
  score: number;
  factors: {
    forecastHorizon: number;
    modelAgreement: number;
    liquidityScore: number;
  };
} {
  // Forecast horizon factor: higher confidence for shorter horizons
  // Max confidence at 12-24 hours, decreasing after
  let forecastHorizon: number;
  if (hoursToEvent < 12) {
    forecastHorizon = 0.9; // Very short term
  } else if (hoursToEvent < 24) {
    forecastHorizon = 1.0; // Sweet spot
  } else if (hoursToEvent < 48) {
    forecastHorizon = 0.85;
  } else if (hoursToEvent < 72) {
    forecastHorizon = 0.7;
  } else {
    forecastHorizon = 0.5;
  }

  // Model agreement factor: lower stdDev = higher confidence
  // Typical stdDev for day-ahead is ~2-3°F
  const modelAgreement = Math.max(0.5, 1 - modelStdDev / 10);

  // Liquidity factor: more volume = more confidence in prices
  const liquidityScore = Math.min(1, Math.log10(volume + 1) / 4);

  // Combined score
  const score =
    forecastHorizon * 0.4 + modelAgreement * 0.4 + liquidityScore * 0.2;

  return {
    score,
    factors: {
      forecastHorizon,
      modelAgreement,
      liquidityScore,
    },
  };
}

/**
 * Detect edges for a set of markets
 */
export function detectEdges(
  markets: NormalizedMarket[],
  quotes: NormalizedQuote[],
  modelProbs: BracketProbabilityResult[],
  options?: {
    minConfidence?: number; // Minimum confidence score to show signal
  }
): DetectedEdge[] {
  const minConfidence = options?.minConfidence ?? 0.5;

  const edges: DetectedEdge[] = [];
  const quoteMap = new Map(quotes.map((q) => [q.marketId, q]));
  const probMap = new Map(modelProbs.map((p) => [p.marketId, p]));

  for (const market of markets) {
    const quote = quoteMap.get(market.id);
    const modelProb = probMap.get(market.id);

    if (!quote || !modelProb) {
      continue;
    }

    const marketProbability = quote.impliedProbability;
    const modelProbability = modelProb.modelProbability;

    // Calculate expected profit for each side (buy and hold to expiration)
    const expectedProfitYes = calculateExpectedProfitYes(modelProbability, quote.yesAsk);
    const expectedProfitNo = calculateExpectedProfitNo(modelProbability, quote.yesBid);

    // Determine trade direction and edge
    let direction: "BUY_YES" | "BUY_NO" | "NO_TRADE" = "NO_TRADE";
    let expectedProfit = 0;

    if (expectedProfitYes > 0 && expectedProfitYes >= expectedProfitNo) {
      direction = "BUY_YES";
      expectedProfit = expectedProfitYes;
    } else if (expectedProfitNo > 0 && expectedProfitNo > expectedProfitYes) {
      direction = "BUY_NO";
      expectedProfit = expectedProfitNo;
    }

    // Calculate hours to event
    const hoursToEvent =
      (market.eventDate.getTime() - Date.now()) / (1000 * 60 * 60);

    // Calculate confidence
    const confidenceResult = calculateConfidence(
      hoursToEvent,
      modelProb.distribution.stdDev,
      quote.volume
    );

    // Apply confidence threshold (only show signal if confident enough)
    if (confidenceResult.score < minConfidence) {
      direction = "NO_TRADE";
    }

    edges.push({
      marketId: market.id,
      ticker: market.ticker,
      question: market.question,
      bracketLow: market.bracketLow,
      bracketHigh: market.bracketHigh,
      eventDate: market.eventDate,
      modelProbability,
      marketProbability,
      expectedProfit,
      expectedProfitYes,
      expectedProfitNo,
      confidence: confidenceResult.score,
      confidenceFactors: confidenceResult.factors,
      yesPrice: quote.yesPrice,
      yesBid: quote.yesBid,
      yesAsk: quote.yesAsk,
      volume: quote.volume,
      direction,
      timestamp: new Date(),
    });
  }

  // Sort by expected profit (best opportunities first)
  edges.sort((a, b) => b.expectedProfit - a.expectedProfit);

  return edges;
}

/**
 * Filter edges to only tradeable opportunities
 */
export function getTradeableEdges(
  edges: DetectedEdge[],
  options?: {
    minExpectedProfit?: number;
    minConfidence?: number;
    maxHoursToEvent?: number;
    minHoursToEvent?: number;
  }
): DetectedEdge[] {
  const minExpectedProfit = options?.minExpectedProfit ?? 0.05; // $0.05 min profit
  const minConfidence = options?.minConfidence ?? 0.6;
  const maxHoursToEvent = options?.maxHoursToEvent ?? 72;
  const minHoursToEvent = options?.minHoursToEvent ?? 1;

  return edges.filter((edge) => {
    if (edge.direction === "NO_TRADE") return false;

    const hoursToEvent =
      (edge.eventDate.getTime() - Date.now()) / (1000 * 60 * 60);

    return (
      edge.expectedProfit >= minExpectedProfit &&
      edge.confidence >= minConfidence &&
      hoursToEvent >= minHoursToEvent &&
      hoursToEvent <= maxHoursToEvent
    );
  });
}

/**
 * Summary statistics for a set of edges
 */
export interface EdgeSummary {
  totalMarkets: number;
  marketsWithEdge: number;
  avgExpectedProfit: number;  // Average $ profit across all markets
  totalExpectedProfit: number; // Sum of positive expected profits
  avgConfidence: number;
  buyYesCount: number;
  buyNoCount: number;
  bestOpportunity: DetectedEdge | null;
}

export function summarizeEdges(edges: DetectedEdge[]): EdgeSummary {
  if (edges.length === 0) {
    return {
      totalMarkets: 0,
      marketsWithEdge: 0,
      avgExpectedProfit: 0,
      totalExpectedProfit: 0,
      avgConfidence: 0,
      buyYesCount: 0,
      buyNoCount: 0,
      bestOpportunity: null,
    };
  }

  const withEdge = edges.filter((e) => e.direction !== "NO_TRADE");
  const positiveEdges = edges.filter((e) => e.expectedProfit > 0);

  return {
    totalMarkets: edges.length,
    marketsWithEdge: withEdge.length,
    avgExpectedProfit:
      edges.reduce((sum, e) => sum + e.expectedProfit, 0) / edges.length,
    totalExpectedProfit:
      positiveEdges.reduce((sum, e) => sum + e.expectedProfit, 0),
    avgConfidence:
      edges.reduce((sum, e) => sum + e.confidence, 0) / edges.length,
    buyYesCount: edges.filter((e) => e.direction === "BUY_YES").length,
    buyNoCount: edges.filter((e) => e.direction === "BUY_NO").length,
    bestOpportunity: edges[0] || null,
  };
}
