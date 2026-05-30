import { TemperatureDistribution } from "@/connectors/weatherModels/types";
import { NormalizedMarket } from "@/connectors/kalshi/types";

/**
 * Weather Probability Engine
 *
 * Calculates the probability that a temperature outcome falls within
 * a specific bracket, given a forecast distribution.
 */

// Standard normal CDF approximation (error < 0.00045)
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate probability that temperature falls within a bracket
 * using a Gaussian distribution
 */
export function calcBracketProbability(
  distribution: TemperatureDistribution,
  bracketLow: number | null,
  bracketHigh: number | null
): number {
  const { mean, stdDev } = distribution;

  // Handle edge cases
  if (stdDev <= 0) {
    // Point mass at mean
    if (bracketLow === null && bracketHigh !== null) {
      return mean < bracketHigh ? 1 : 0;
    }
    if (bracketLow !== null && bracketHigh === null) {
      return mean >= bracketLow ? 1 : 0;
    }
    if (bracketLow !== null && bracketHigh !== null) {
      return mean >= bracketLow && mean < bracketHigh ? 1 : 0;
    }
    return 1;
  }

  // Calculate CDF values
  let lowCDF = 0;
  let highCDF = 1;

  if (bracketLow !== null) {
    const zLow = (bracketLow - mean) / stdDev;
    lowCDF = normalCDF(zLow);
  }

  if (bracketHigh !== null) {
    const zHigh = (bracketHigh - mean) / stdDev;
    highCDF = normalCDF(zHigh);
  }

  return Math.max(0, highCDF - lowCDF);
}

/**
 * Calculate probabilities for all brackets in a set of markets
 */
export function calcAllBracketProbabilities(
  distribution: TemperatureDistribution,
  markets: NormalizedMarket[]
): Map<string, number> {
  const probabilities = new Map<string, number>();

  for (const market of markets) {
    const prob = calcBracketProbability(
      distribution,
      market.bracketLow,
      market.bracketHigh
    );
    probabilities.set(market.id, prob);
  }

  // Verify probabilities sum to approximately 1
  const total = Array.from(probabilities.values()).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1.0) > 0.01) {
    console.warn(
      `Bracket probabilities sum to ${total.toFixed(3)}, expected ~1.0`
    );
  }

  return probabilities;
}

/**
 * Bracket probability result with metadata
 */
export interface BracketProbabilityResult {
  marketId: string;
  bracketLow: number | null;
  bracketHigh: number | null;
  modelProbability: number;
  distribution: {
    mean: number;
    stdDev: number;
  };
}

/**
 * Calculate model probabilities for a forecast and set of markets
 */
export function calculateModelProbabilities(
  distribution: TemperatureDistribution,
  markets: NormalizedMarket[]
): BracketProbabilityResult[] {
  return markets.map((market) => ({
    marketId: market.id,
    bracketLow: market.bracketLow,
    bracketHigh: market.bracketHigh,
    modelProbability: calcBracketProbability(
      distribution,
      market.bracketLow,
      market.bracketHigh
    ),
    distribution: {
      mean: distribution.mean,
      stdDev: distribution.stdDev,
    },
  }));
}

/**
 * Apply historical bias correction to a distribution
 * (Future enhancement: use historical forecast errors to adjust)
 */
export function applyBiasCorrection(
  distribution: TemperatureDistribution,
  _stationId: string,
  _forecastHorizonHours: number
): TemperatureDistribution {
  // TODO: Implement historical bias tracking and correction
  // For now, return the original distribution
  return distribution;
}

/**
 * Combine multiple forecast distributions (ensemble)
 * using weighted average
 */
export function combineDistributions(
  distributions: TemperatureDistribution[],
  weights?: number[]
): TemperatureDistribution {
  if (distributions.length === 0) {
    throw new Error("Cannot combine empty list of distributions");
  }

  if (distributions.length === 1) {
    return distributions[0];
  }

  // Default to equal weights
  const w = weights || distributions.map(() => 1 / distributions.length);

  // Weighted mean
  const mean = distributions.reduce(
    (sum, d, i) => sum + w[i] * d.mean,
    0
  );

  // Combined variance (assuming independence)
  // Var(weighted sum) = sum of w^2 * Var
  const variance = distributions.reduce(
    (sum, d, i) => sum + w[i] * w[i] * d.stdDev * d.stdDev,
    0
  );

  return {
    mean,
    stdDev: Math.sqrt(variance),
  };
}
