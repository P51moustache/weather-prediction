import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kalshiClient } from "@/connectors/kalshi";
import { loadSettingsFromDb } from "@/core/executionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get configured city from database
    const settings = await loadSettingsFromDb();
    const city = settings.city;
    const cityLabel = city === "los_angeles" ? "Los Angeles" : "New York";

    // Fetch from Kalshi API - no fallback
    const { markets, quotes } = await kalshiClient.getTemperatureMarkets(city);

    if (markets.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No ${cityLabel} temperature markets found on Kalshi`,
          hint: "Make sure KALSHI_API_KEY is set in .env or try a different city",
        },
        { status: 404 }
      );
    }

    // Store markets in database
    for (const market of markets) {
      await prisma.market.upsert({
        where: { id: market.id },
        update: {
          question: market.question,
          status: market.status,
          updatedAt: new Date(),
        },
        create: {
          id: market.id,
          ticker: market.ticker,
          question: market.question,
          category: market.category,
          city: market.city,
          station: market.station,
          eventDate: market.eventDate,
          bracketLow: market.bracketLow,
          bracketHigh: market.bracketHigh,
          settlementSource: market.settlementSource,
        },
      });
    }

    // Store latest snapshots
    for (const quote of quotes) {
      await prisma.marketSnapshot.create({
        data: {
          marketId: quote.marketId,
          yesPrice: quote.yesPrice,
          noPrice: quote.noPrice,
          yesBid: quote.yesBid,
          yesAsk: quote.yesAsk,
          volume: quote.volume,
        },
      });
    }

    return NextResponse.json({
      success: true,
      markets,
      quotes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        hint: "Make sure KALSHI_API_KEY is set in .env",
      },
      { status: 500 }
    );
  }
}
