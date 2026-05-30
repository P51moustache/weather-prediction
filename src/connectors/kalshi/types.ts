// Kalshi API response types

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  settlement_timer_seconds: number;
  status: string;
  response_price_units: string;
  notional_value: number;
  tick_size: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_yes_bid: number;
  previous_yes_ask: number;
  previous_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  result: string;
  can_close_early: boolean;
  expiration_value: string;
  category: string;
  risk_limit_cents: number;
  strike_type: string;
  floor_strike?: number;
  cap_strike?: number;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  mutually_exclusive: boolean;
  category: string;
  markets: KalshiMarket[];
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor: string;
}

export interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor: string;
}

// Normalized types for internal use

export interface NormalizedMarket {
  id: string;
  ticker: string;
  question: string;
  category: string;
  city: string;
  station: string;
  eventDate: Date;
  bracketLow: number | null;
  bracketHigh: number | null;
  settlementSource: string;
  status: string;
}

export interface NormalizedQuote {
  marketId: string;
  ticker: string;
  yesPrice: number;
  noPrice: number;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  volume: number;
  impliedProbability: number;
  timestamp: Date;
}

export interface KalshiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}
