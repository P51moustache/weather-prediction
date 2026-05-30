import { NextResponse } from "next/server";
import { kalshiClient } from "@/connectors/kalshi";
import { executionEngine } from "@/core/executionEngine";

export const dynamic = "force-dynamic";

interface Position {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export async function GET() {
  try {
    const config = executionEngine.getConfig();
    const dailyStats = executionEngine.getDailyStats();

    // In paper mode, return simulated data
    if (config.mode === "paper") {
      return NextResponse.json({
        success: true,
        balance: 10000, // Paper trading starts with $10k
        positions: [] as Position[],
        totalUnrealizedPnL: 0,
        totalRealizedPnL: dailyStats.totalPnL,
        mode: config.mode,
      });
    }

    // Live mode: Get real positions and balance from Kalshi
    try {
      const [positionsData, balanceData] = await Promise.all([
        kalshiClient.getPositions(),
        kalshiClient.getBalance(),
      ]);

      // Transform Kalshi positions to our format
      const positions: Position[] = positionsData.market_positions
        .filter(pos => pos.position !== 0)
        .map(pos => {
          // Position is positive for yes, negative for no
          const side: "yes" | "no" = pos.position > 0 ? "yes" : "no";
          const quantity = Math.abs(pos.position);
          const avgPrice = quantity > 0 ? pos.total_cost / quantity / 100 : 0;
          // Note: We'd need to fetch current market price for accurate PnL
          // For now, estimate based on exposure
          const currentPrice = avgPrice; // Placeholder
          const unrealizedPnL = pos.market_exposure / 100;

          return {
            ticker: pos.ticker,
            side,
            quantity,
            avgPrice,
            currentPrice,
            unrealizedPnL,
          };
        });

      const totalUnrealizedPnL = positions.reduce(
        (sum, pos) => sum + pos.unrealizedPnL,
        0
      );

      return NextResponse.json({
        success: true,
        balance: balanceData.balance / 100, // Convert cents to dollars
        positions,
        totalUnrealizedPnL,
        totalRealizedPnL: dailyStats.totalPnL,
        mode: config.mode,
      });
    } catch (apiError) {
      // If API fails (e.g., no credentials), return default data
      console.warn("Failed to fetch Kalshi account data:", apiError);
      return NextResponse.json({
        success: true,
        balance: 0,
        positions: [] as Position[],
        totalUnrealizedPnL: 0,
        totalRealizedPnL: dailyStats.totalPnL,
        mode: config.mode,
        warning: "API credentials not configured",
      });
    }
  } catch (error) {
    console.error("Error fetching account data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch account data" },
      { status: 500 }
    );
  }
}
