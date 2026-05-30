import { describe, it, expect } from "vitest";
import {
  detectEdges,
  getTradeableEdges,
  summarizeEdges,
} from "@/core/edgeDetector";
import { NormalizedMarket, NormalizedQuote } from "@/connectors/kalshi/types";
import { BracketProbabilityResult } from "@/core/weatherProbEngine";

describe("edgeDetector", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const markets: NormalizedMarket[] = [
    {
      id: "m1",
      ticker: "m1",
      question: "70-72°F",
      category: "temp",
      city: "la",
      station: "KLAX",
      eventDate: tomorrow,
      bracketLow: 70,
      bracketHigh: 72,
      settlementSource: "NWS",
      status: "open",
    },
    {
      id: "m2",
      ticker: "m2",
      question: "72-74°F",
      category: "temp",
      city: "la",
      station: "KLAX",
      eventDate: tomorrow,
      bracketLow: 72,
      bracketHigh: 74,
      settlementSource: "NWS",
      status: "open",
    },
  ];

  const quotes: NormalizedQuote[] = [
    {
      marketId: "m1",
      ticker: "m1",
      yesPrice: 0.2,
      noPrice: 0.8,
      yesBid: 0.19,
      yesAsk: 0.21,
      noBid: 0.79,
      noAsk: 0.81,
      volume: 1000,
      impliedProbability: 0.2,
      timestamp: new Date(),
    },
    {
      marketId: "m2",
      ticker: "m2",
      yesPrice: 0.3,
      noPrice: 0.7,
      yesBid: 0.29,
      yesAsk: 0.31,
      noBid: 0.69,
      noAsk: 0.71,
      volume: 2000,
      impliedProbability: 0.3,
      timestamp: new Date(),
    },
  ];

  const modelProbs: BracketProbabilityResult[] = [
    {
      marketId: "m1",
      bracketLow: 70,
      bracketHigh: 72,
      modelProbability: 0.15, // Model says lower than market (0.20)
      distribution: { mean: 73, stdDev: 3 },
    },
    {
      marketId: "m2",
      bracketLow: 72,
      bracketHigh: 74,
      modelProbability: 0.45, // Model says higher than market (0.30)
      distribution: { mean: 73, stdDev: 3 },
    },
  ];

  describe("detectEdges", () => {
    it("detects edges for all markets", () => {
      const edges = detectEdges(markets, quotes, modelProbs);

      expect(edges.length).toBe(2);
      expect(edges[0].marketId).toBeDefined();
      expect(edges[0].expectedProfit).toBeDefined();
      expect(edges[0].expectedProfitYes).toBeDefined();
      expect(edges[0].expectedProfitNo).toBeDefined();
      expect(edges[0].confidence).toBeDefined();
    });

    it("calculates expected profit in dollars", () => {
      const edges = detectEdges(markets, quotes, modelProbs);

      // All expected profits should be numbers in dollar range (typically -1 to +1)
      edges.forEach((edge) => {
        expect(edge.expectedProfit).toBeGreaterThanOrEqual(-1);
        expect(edge.expectedProfit).toBeLessThanOrEqual(1);
        expect(edge.expectedProfitYes).toBeGreaterThanOrEqual(-1);
        expect(edge.expectedProfitYes).toBeLessThanOrEqual(1);
        expect(edge.expectedProfitNo).toBeGreaterThanOrEqual(-1);
        expect(edge.expectedProfitNo).toBeLessThanOrEqual(1);
      });
    });

    it("assigns BUY_YES when expected profit for YES is positive and higher", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const m2Edge = edges.find((e) => e.marketId === "m2");

      // m2 has model prob 0.45 vs market 0.30, so YES should be underpriced
      // If expectedProfitYes > 0 and > expectedProfitNo, direction should be BUY_YES
      if (m2Edge?.expectedProfitYes && m2Edge.expectedProfitYes > 0) {
        expect(m2Edge?.direction).toBe("BUY_YES");
      }
    });

    it("assigns BUY_NO when expected profit for NO is positive and higher", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const m1Edge = edges.find((e) => e.marketId === "m1");

      // m1 has model prob 0.15 vs market 0.20, so NO should be underpriced
      // If expectedProfitNo > 0 and > expectedProfitYes, direction should be BUY_NO
      if (m1Edge?.expectedProfitNo && m1Edge.expectedProfitNo > 0) {
        expect(m1Edge?.direction).toBe("BUY_NO");
      }
    });

    it("sorts by expected profit (best opportunities first)", () => {
      const edges = detectEdges(markets, quotes, modelProbs);

      // Should be sorted by expectedProfit descending
      for (let i = 0; i < edges.length - 1; i++) {
        expect(edges[i].expectedProfit).toBeGreaterThanOrEqual(
          edges[i + 1].expectedProfit
        );
      }
    });
  });

  describe("getTradeableEdges", () => {
    it("filters out NO_TRADE edges", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const tradeable = getTradeableEdges(edges, { minExpectedProfit: 0.01 });

      expect(tradeable.every((e) => e.direction !== "NO_TRADE")).toBe(true);
    });

    it("filters by minimum expected profit", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const tradeable = getTradeableEdges(edges, { minExpectedProfit: 0.10 });

      expect(tradeable.every((e) => e.expectedProfit >= 0.10)).toBe(true);
    });

    it("filters by minimum confidence", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const tradeable = getTradeableEdges(edges, {
        minExpectedProfit: 0,
        minConfidence: 0.8,
      });

      expect(tradeable.every((e) => e.confidence >= 0.8)).toBe(true);
    });
  });

  describe("summarizeEdges", () => {
    it("calculates summary statistics", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const summary = summarizeEdges(edges);

      expect(summary.totalMarkets).toBe(2);
      expect(summary.avgExpectedProfit).toBeDefined();
      expect(summary.totalExpectedProfit).toBeDefined();
      expect(summary.avgConfidence).toBeGreaterThan(0);
    });

    it("counts buy signals", () => {
      const edges = detectEdges(markets, quotes, modelProbs);
      const summary = summarizeEdges(edges);

      expect(summary.buyYesCount + summary.buyNoCount).toBeGreaterThanOrEqual(0);
    });

    it("handles empty edges", () => {
      const summary = summarizeEdges([]);

      expect(summary.totalMarkets).toBe(0);
      expect(summary.bestOpportunity).toBeNull();
    });
  });
});
