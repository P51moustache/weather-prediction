import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kalshiClient, NormalizedMarket, NormalizedQuote } from "@/connectors/kalshi";
import { nwsClient, NormalizedForecast, TemperatureDistribution } from "@/connectors/weatherModels";
import { calculateModelProbabilities } from "@/core/weatherProbEngine";
import { detectEdges } from "@/core/edgeDetector";
import { loadSettingsFromDb, City } from "@/core/executionEngine";

export const dynamic = "force-dynamic";

interface SyncResult {
  markets: NormalizedMarket[];
  quotes: NormalizedQuote[];
  forecasts: NormalizedForecast[];
  distribution: TemperatureDistribution;
}

async function fetchRealData(city: City): Promise<SyncResult> {
  const errors: string[] = [];

  // Fetch real Kalshi markets for the configured city
  let markets: NormalizedMarket[] = [];
  let quotes: NormalizedQuote[] = [];

  try {
    const kalshiData = await kalshiClient.getTemperatureMarkets(city);
    if (kalshiData.markets.length > 0) {
      markets = kalshiData.markets;
      quotes = kalshiData.quotes;
    } else {
      const cityLabel = city === "los_angeles" ? "Los Angeles" : "New York";
      errors.push(`No ${cityLabel} temperature markets found on Kalshi`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Kalshi API error: ${msg}`);
  }

  if (markets.length === 0) {
    throw new Error(`No market data available. ${errors.join(". ")}`);
  }

  // Get today's date string for filtering
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Filter markets to only include today and future dates
  const futureMarkets = markets.filter((m) => {
    const dateStr = m.eventDate.toISOString().split("T")[0];
    return dateStr >= todayStr;
  });

  // Use future markets if available, otherwise fall back to all markets
  const marketsToProcess = futureMarkets.length > 0 ? futureMarkets : markets;

  // Find the most common market date to determine which forecast to use
  const dateCounts = new Map<string, number>();
  for (const market of marketsToProcess) {
    const dateStr = market.eventDate.toISOString().split("T")[0];
    dateCounts.set(dateStr, (dateCounts.get(dateStr) || 0) + 1);
  }
  const primaryMarketDate = Array.from(dateCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Fetch real NWS forecasts for the configured city
  let forecasts: NormalizedForecast[] = [];
  let distribution: TemperatureDistribution;

  try {
    // Get unique future dates from markets and fetch forecasts for each
    const uniqueDates = Array.from(dateCounts.keys())
      .filter((d) => d >= todayStr)
      .sort();

    // If no future dates, use tomorrow
    if (uniqueDates.length === 0) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      uniqueDates.push(tomorrow.toISOString().split("T")[0]);
    }

    const forecastPromises = uniqueDates.map((dateStr) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      // Use noon local time to avoid timezone issues
      const targetDate = new Date(year, month - 1, day, 12, 0, 0);
      return nwsClient.getForecastForCity(city, targetDate);
    });

    forecasts = await Promise.all(forecastPromises);

    // Use the forecast that matches the primary market date
    const primaryForecast = forecasts.find((f) => {
      const forecastDateStr = f.targetDate.toISOString().split("T")[0];
      return forecastDateStr === primaryMarketDate;
    }) || forecasts[0];

    distribution = nwsClient.buildDistribution(primaryForecast);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`NWS API error: ${msg}`);
    throw new Error(`Failed to fetch weather data: ${msg}`);
  }

  return {
    markets,
    quotes,
    forecasts,
    distribution: distribution!,
  };
}

export async function POST() {
  const startTime = Date.now();
  const logs: string[] = [];

  try {
    // Get configured city from database
    const settings = await loadSettingsFromDb();
    const city = settings.city;
    const cityLabel = city === "los_angeles" ? "Los Angeles" : "New York";

    logs.push(`Starting sync for ${cityLabel}...`);

    // Fetch real data only - no mock fallback
    const { markets, quotes, forecasts, distribution } = await fetchRealData(city);

    logs.push(`Fetched ${markets.length} Kalshi markets`);
    logs.push(`Fetched ${forecasts.length} NWS forecasts`);

    // Store markets FIRST so their rows exist before any child
    // (MarketSnapshot / Edge) references them. We track which ids were
    // actually persisted so child writes can only ever reference a parent
    // that exists — otherwise Prisma raises a foreign-key constraint error.
    const persistedMarketIds = new Set<string>();
    for (const market of markets) {
      await prisma.market.upsert({
        where: { id: market.id },
        update: {
          question: market.question,
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
      persistedMarketIds.add(market.id);
    }

    // Store snapshots. Use a nested `connect` so the parent relation is
    // explicit, and skip any quote whose market was not persisted to avoid
    // a foreign-key error.
    let snapshotsStored = 0;
    for (const quote of quotes) {
      if (!persistedMarketIds.has(quote.marketId)) {
        continue;
      }
      await prisma.marketSnapshot.create({
        data: {
          market: { connect: { id: quote.marketId } },
          yesPrice: quote.yesPrice,
          noPrice: quote.noPrice,
          yesBid: quote.yesBid,
          yesAsk: quote.yesAsk,
          volume: quote.volume,
        },
      });
      snapshotsStored += 1;
    }
    logs.push(`Stored ${snapshotsStored} market snapshots`);

    // Store forecasts
    for (const forecast of forecasts) {
      await prisma.forecast.create({
        data: {
          station: forecast.station,
          targetDate: forecast.targetDate,
          source: forecast.source,
          pointForecast: forecast.pointForecast,
          forecastLow: forecast.forecastLow,
          forecastHigh: forecast.forecastHigh,
          stdDev: forecast.stdDev,
          rawData: forecast.rawData,
        },
      });
    }
    logs.push("Stored forecasts");

    // Calculate edges
    logs.push("Calculating edges...");
    const modelProbs = calculateModelProbabilities(distribution, markets);
    const edges = detectEdges(markets, quotes, modelProbs);
    logs.push(`Detected ${edges.length} edges`);

    // Store edges. Like snapshots, connect to the persisted parent market and
    // skip any edge whose market row is missing to avoid a foreign-key error.
    let edgesStored = 0;
    for (const edge of edges) {
      if (!persistedMarketIds.has(edge.marketId)) {
        continue;
      }
      await prisma.edge.create({
        data: {
          market: { connect: { id: edge.marketId } },
          modelProb: edge.modelProbability,
          marketProb: edge.marketProbability,
          expectedProfit: edge.expectedProfit,
          expectedProfitYes: edge.expectedProfitYes,
          expectedProfitNo: edge.expectedProfitNo,
          direction: edge.direction,
          confidence: edge.confidence,
        },
      });
      edgesStored += 1;
    }
    logs.push(`Stored ${edgesStored} edges`);

    // Log the sync
    await prisma.systemLog.create({
      data: {
        level: "info",
        source: "sync",
        message: `Sync completed: ${markets.length} markets, ${forecasts.length} forecasts, ${edges.length} edges`,
        metadata: JSON.stringify({
          duration: Date.now() - startTime,
          marketsCount: markets.length,
          forecastsCount: forecasts.length,
          edgesCount: edges.length,
        }),
      },
    });

    const duration = Date.now() - startTime;
    logs.push(`Sync completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      logs,
      stats: {
        markets: markets.length,
        forecasts: forecasts.length,
        edges: edges.length,
        edgesWithOpportunity: edges.filter((e) => e.direction !== "NO_TRADE").length,
      },
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", error);
    logs.push(`Error: ${errorMessage}`);

    await prisma.systemLog.create({
      data: {
        level: "error",
        source: "sync",
        message: `Sync failed: ${errorMessage}`,
      },
    });

    return NextResponse.json(
      {
        success: false,
        logs,
        error: errorMessage,
        hint: "Make sure KALSHI_API_KEY and KALSHI_PRIVATE_KEY_PATH are set in your .env file for market data"
      },
      { status: 500 }
    );
  }
}
