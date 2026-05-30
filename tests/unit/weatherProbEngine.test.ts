import { describe, it, expect } from "vitest";
import {
  calcBracketProbability,
  calcAllBracketProbabilities,
  combineDistributions,
} from "@/core/weatherProbEngine";
import { TemperatureDistribution } from "@/connectors/weatherModels/types";
import { NormalizedMarket } from "@/connectors/kalshi/types";

describe("weatherProbEngine", () => {
  describe("calcBracketProbability", () => {
    const distribution: TemperatureDistribution = {
      mean: 72,
      stdDev: 3,
    };

    it("calculates probability for middle bracket", () => {
      // Bracket 70-74 should have high probability when mean is 72
      const prob = calcBracketProbability(distribution, 70, 74);
      expect(prob).toBeGreaterThan(0.4);
      expect(prob).toBeLessThan(0.8);
    });

    it("calculates probability for lower bracket", () => {
      // Bracket <68 should have low probability when mean is 72
      const prob = calcBracketProbability(distribution, null, 68);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(0.15);
    });

    it("calculates probability for upper bracket", () => {
      // Bracket >=76 should have low probability when mean is 72
      const prob = calcBracketProbability(distribution, 76, null);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(0.15);
    });

    it("handles zero stdDev (point mass)", () => {
      const pointDist: TemperatureDistribution = { mean: 72, stdDev: 0 };

      expect(calcBracketProbability(pointDist, 70, 74)).toBe(1);
      expect(calcBracketProbability(pointDist, 74, 76)).toBe(0);
      expect(calcBracketProbability(pointDist, null, 70)).toBe(0);
      expect(calcBracketProbability(pointDist, 72, null)).toBe(1);
    });

    it("probabilities sum to approximately 1", () => {
      const brackets = [
        { low: null, high: 68 },
        { low: 68, high: 70 },
        { low: 70, high: 72 },
        { low: 72, high: 74 },
        { low: 74, high: 76 },
        { low: 76, high: null },
      ];

      const total = brackets.reduce(
        (sum, b) => sum + calcBracketProbability(distribution, b.low, b.high),
        0
      );

      expect(total).toBeCloseTo(1, 2);
    });
  });

  describe("calcAllBracketProbabilities", () => {
    it("returns probabilities for all markets", () => {
      const distribution: TemperatureDistribution = { mean: 72, stdDev: 3 };
      const markets: NormalizedMarket[] = [
        {
          id: "m1",
          ticker: "m1",
          question: "test",
          category: "temp",
          city: "la",
          station: "KLAX",
          eventDate: new Date(),
          bracketLow: 70,
          bracketHigh: 74,
          settlementSource: "NWS",
          status: "open",
        },
        {
          id: "m2",
          ticker: "m2",
          question: "test",
          category: "temp",
          city: "la",
          station: "KLAX",
          eventDate: new Date(),
          bracketLow: 74,
          bracketHigh: 78,
          settlementSource: "NWS",
          status: "open",
        },
      ];

      const probs = calcAllBracketProbabilities(distribution, markets);

      expect(probs.size).toBe(2);
      expect(probs.get("m1")).toBeGreaterThan(probs.get("m2")!);
    });
  });

  describe("combineDistributions", () => {
    it("combines two distributions with equal weights", () => {
      const d1: TemperatureDistribution = { mean: 70, stdDev: 2 };
      const d2: TemperatureDistribution = { mean: 74, stdDev: 2 };

      const combined = combineDistributions([d1, d2]);

      expect(combined.mean).toBe(72);
      expect(combined.stdDev).toBeGreaterThan(0);
    });

    it("combines with custom weights", () => {
      const d1: TemperatureDistribution = { mean: 70, stdDev: 2 };
      const d2: TemperatureDistribution = { mean: 74, stdDev: 2 };

      const combined = combineDistributions([d1, d2], [0.75, 0.25]);

      expect(combined.mean).toBe(71);
    });

    it("returns single distribution unchanged", () => {
      const d1: TemperatureDistribution = { mean: 72, stdDev: 3 };

      const combined = combineDistributions([d1]);

      expect(combined).toEqual(d1);
    });

    it("throws on empty array", () => {
      expect(() => combineDistributions([])).toThrow();
    });
  });
});
