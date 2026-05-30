import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  KalshiConfig,
  KalshiMarketsResponse,
  KalshiEventsResponse,
  KalshiMarket,
  NormalizedMarket,
  NormalizedQuote,
} from "./types";

const DEFAULT_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

// Trading types
export interface OrderRequest {
  ticker: string;
  side: "yes" | "no";
  type: "limit" | "market";
  count: number;
  yes_price?: number;
  expiration_ts?: number;
}

export interface OrderResponse {
  order: {
    order_id: string;
    ticker: string;
    status: string;
    side: string;
    type: string;
    yes_price: number;
    no_price: number;
    created_time: string;
    expiration_time: string;
    taker_fill_count: number;
    maker_fill_count: number;
    place_count: number;
    decrease_count: number;
    remaining_count: number;
  };
}

export interface PositionResponse {
  market_positions: Array<{
    ticker: string;
    position: number;
    total_cost: number;
    market_exposure: number;
    resting_orders_count: number;
  }>;
}

export interface BalanceResponse {
  balance: number;
  payout: number;
}

export interface FillResponse {
  fills: Array<{
    trade_id: string;
    ticker: string;
    side: string;
    yes_price: number;
    no_price: number;
    count: number;
    is_taker: boolean;
    created_time: string;
  }>;
  cursor: string;
}

export class KalshiClient {
  private config: KalshiConfig;
  private privateKey: string | null = null;
  private rateLimitRemaining: number = 100;
  private rateLimitReset: Date = new Date();

  constructor(config?: Partial<KalshiConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.KALSHI_API_KEY || "",
      apiSecret: config?.apiSecret || process.env.KALSHI_API_SECRET || "",
      baseUrl: config?.baseUrl || DEFAULT_BASE_URL,
    };

    // Load private key if path is set
    const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
    if (privateKeyPath) {
      try {
        const fullPath = path.resolve(process.cwd(), privateKeyPath);
        this.privateKey = fs.readFileSync(fullPath, "utf8");
      } catch (error) {
        console.warn("Failed to load Kalshi private key:", error);
      }
    }
  }

  /**
   * Sign a request using RSA-PSS
   */
  private signRequest(timestamp: string, method: string, pathWithoutQuery: string): string {
    if (!this.privateKey) {
      throw new Error("Kalshi private key not configured");
    }

    const message = timestamp + method.toUpperCase() + pathWithoutQuery;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(message);
    sign.end();

    const signature = sign.sign(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      "base64"
    );

    return signature;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const pathWithoutQuery = endpoint.split("?")[0];

    // Check rate limit
    if (this.rateLimitRemaining <= 0 && new Date() < this.rateLimitReset) {
      const waitMs = this.rateLimitReset.getTime() - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Add RSA authentication headers
    if (this.config.apiKey && this.privateKey) {
      const timestamp = Date.now().toString();
      const method = options.method || "GET";
      const signature = this.signRequest(timestamp, method, pathWithoutQuery);

      headers["KALSHI-ACCESS-KEY"] = this.config.apiKey;
      headers["KALSHI-ACCESS-SIGNATURE"] = signature;
      headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    // Update rate limit tracking
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");
    if (remaining) this.rateLimitRemaining = parseInt(remaining, 10);
    if (reset) this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Kalshi API error: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    return response.json();
  }

  /**
   * Fetch weather-related markets from Kalshi
   * Filters for temperature/weather categories
   */
  async getWeatherMarkets(params?: {
    city?: string;
    seriesTicker?: string;
    minCloseTime?: Date;
    maxCloseTime?: Date;
    limit?: number;
    cursor?: string;
  }): Promise<{ markets: KalshiMarket[]; cursor: string }> {
    const searchParams = new URLSearchParams();

    // Use provided series ticker or default based on city
    if (params?.seriesTicker) {
      searchParams.set("series_ticker", params.seriesTicker);
    } else if (params?.city === "los_angeles") {
      searchParams.set("series_ticker", "KXHIGHLAX"); // LAX airport code
    } else if (params?.city === "new_york") {
      searchParams.set("series_ticker", "KXHIGHNY");
    } else {
      // Default to NYC high temp markets (most liquid)
      searchParams.set("series_ticker", "KXHIGHNY");
    }

    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.cursor) {
      searchParams.set("cursor", params.cursor);
    }
    if (params?.minCloseTime) {
      searchParams.set("min_close_ts", Math.floor(params.minCloseTime.getTime() / 1000).toString());
    }
    if (params?.maxCloseTime) {
      searchParams.set("max_close_ts", Math.floor(params.maxCloseTime.getTime() / 1000).toString());
    }

    searchParams.set("status", "open");

    const response = await this.request<KalshiMarketsResponse>(
      `/markets?${searchParams.toString()}`
    );

    return response;
  }

  /**
   * Get events (groups of markets) for weather
   */
  async getWeatherEvents(params?: {
    seriesTicker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<KalshiEventsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.seriesTicker) {
      searchParams.set("series_ticker", params.seriesTicker);
    }
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.cursor) {
      searchParams.set("cursor", params.cursor);
    }

    searchParams.set("status", "open");

    return this.request<KalshiEventsResponse>(
      `/events?${searchParams.toString()}`
    );
  }

  /**
   * Get a single market by ticker
   */
  async getMarket(ticker: string): Promise<KalshiMarket> {
    const response = await this.request<{ market: KalshiMarket }>(
      `/markets/${ticker}`
    );
    return response.market;
  }

  /**
   * Normalize a Kalshi market to our internal format
   */
  normalizeMarket(market: KalshiMarket): NormalizedMarket {
    // Parse bracket from title or strike values
    const bracketLow = market.floor_strike ?? null;
    const bracketHigh = market.cap_strike ?? null;

    // Determine city from series ticker
    let city = "unknown";
    let station = "unknown";
    if (market.event_ticker.includes("LAX") || market.ticker.includes("LAX")) {
      city = "los_angeles";
      station = "KLAX"; // LAX airport weather station
    } else if (market.event_ticker.includes("NY") || market.ticker.includes("NY")) {
      city = "new_york";
      station = "KNYC"; // NYC Central Park weather station
    }

    // Parse event date from ticker (format: KXHIGHNY-26JAN22-T47 -> Jan 22, 2026)
    // The format is YYMMMDD where YY is year, MMM is month, DD is day
    let eventDate = new Date(market.expiration_time);
    const tickerMatch = market.ticker.match(/-(\d{2})([A-Z]{3})(\d{2})-/);
    if (tickerMatch) {
      const [, year, monthStr, day] = tickerMatch;
      const months: Record<string, number> = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
      };
      const month = months[monthStr];
      const fullYear = 2000 + parseInt(year, 10);
      if (month !== undefined) {
        eventDate = new Date(fullYear, month, parseInt(day, 10), 12, 0, 0);
      }
    }

    return {
      id: market.ticker,
      ticker: market.ticker,
      question: market.title,
      category: "temperature",
      city,
      station,
      eventDate,
      bracketLow,
      bracketHigh,
      settlementSource: "NWS Daily Climate Report",
      status: market.status,
    };
  }

  /**
   * Normalize market quote data
   */
  normalizeQuote(market: KalshiMarket): NormalizedQuote {
    // Kalshi prices are in cents (0-100)
    const yesAsk = market.yes_ask / 100;
    const yesBid = market.yes_bid / 100;
    // Use midpoint of bid/ask as the market price (matches Kalshi's display)
    // Fall back to last_price if no bid/ask available
    const yesPrice = (yesBid > 0 && yesAsk > 0)
      ? (yesBid + yesAsk) / 2
      : market.last_price / 100;

    return {
      marketId: market.ticker,
      ticker: market.ticker,
      yesPrice,
      noPrice: 1 - yesPrice,
      yesBid,
      yesAsk,
      noBid: 1 - yesAsk,
      noAsk: 1 - yesBid,
      volume: market.volume,
      impliedProbability: yesPrice,
      timestamp: new Date(),
    };
  }

  /**
   * Fetch and normalize temperature markets for a specific city
   */
  async getTemperatureMarkets(city: "new_york" | "los_angeles"): Promise<{
    markets: NormalizedMarket[];
    quotes: NormalizedQuote[];
  }> {
    // Require authentication
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials not configured. Set KALSHI_API_KEY and KALSHI_PRIVATE_KEY_PATH in .env");
    }

    const response = await this.getWeatherMarkets({ city });

    if (!response.markets || response.markets.length === 0) {
      const cityLabel = city === "los_angeles" ? "Los Angeles" : "New York";
      throw new Error(`No ${cityLabel} temperature markets found on Kalshi. Try switching to a different city.`);
    }

    const markets = response.markets.map((m) => this.normalizeMarket(m));
    const quotes = response.markets.map((m) => this.normalizeQuote(m));

    return { markets, quotes };
  }

  /**
   * Place an order on Kalshi
   */
  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials required for trading");
    }

    return this.request<OrderResponse>("/portfolio/orders", {
      method: "POST",
      body: JSON.stringify({
        ticker: order.ticker,
        action: "buy",
        side: order.side,
        type: order.type,
        count: order.count,
        yes_price: order.yes_price,
        expiration_ts: order.expiration_ts,
      }),
    });
  }

  /**
   * Cancel an existing order
   */
  async cancelOrder(orderId: string): Promise<{ order: { order_id: string; status: string } }> {
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials required for trading");
    }

    return this.request(`/portfolio/orders/${orderId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<PositionResponse> {
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials required for positions");
    }

    return this.request<PositionResponse>("/portfolio/positions");
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<BalanceResponse> {
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials required for balance");
    }

    return this.request<BalanceResponse>("/portfolio/balance");
  }

  /**
   * Get trade fills/history
   */
  async getFills(params?: {
    ticker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<FillResponse> {
    if (!this.config.apiKey || !this.privateKey) {
      throw new Error("Kalshi API credentials required for fills");
    }

    const searchParams = new URLSearchParams();
    if (params?.ticker) searchParams.set("ticker", params.ticker);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.cursor) searchParams.set("cursor", params.cursor);

    return this.request<FillResponse>(`/portfolio/fills?${searchParams.toString()}`);
  }
}

// Export singleton instance
export const kalshiClient = new KalshiClient();
