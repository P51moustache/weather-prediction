import { NextRequest, NextResponse } from "next/server";
import { kalshiClient, NormalizedMarket, NormalizedQuote } from "@/connectors/kalshi";
import { nwsClient, NormalizedForecast, TemperatureDistribution } from "@/connectors/weatherModels";
import { calculateModelProbabilities } from "@/core/weatherProbEngine";
import { detectEdges, summarizeEdges } from "@/core/edgeDetector";
import { loadSettingsFromDb, City } from "@/core/executionEngine";

export const dynamic = "force-dynamic";

interface DataResult {
  markets: NormalizedMarket[];
  quotes: NormalizedQuote[];
  forecast: NormalizedForecast;
  distribution: TemperatureDistribution;
}

async function fetchData(city: City): Promise<DataResult> {
  // Fetch real Kalshi markets for the configured city
  let markets: NormalizedMarket[] = [];
  let quotes: NormalizedQuote[] = [];
  let kalshiError: string | null = null;

  try {
    const kalshiData = await kalshiClient.getTemperatureMarkets(city);
    if (kalshiData.markets.length > 0) {
      markets = kalshiData.markets;
      quotes = kalshiData.quotes;
    } else {
      const cityLabel = city === "los_angeles" ? "Los Angeles" : "New York";
      kalshiError = `No ${cityLabel} temperature markets found on Kalshi`;
    }
  } catch (error) {
    kalshiError = error instanceof Error ? error.message : String(error);
  }

  if (markets.length === 0) {
    throw new Error(`Kalshi API error: ${kalshiError}`);
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
  markets = futureMarkets.length > 0 ? futureMarkets : markets;
  quotes = quotes.filter((q) => markets.some((m) => m.id === q.marketId));

  // Find the most common market date to use for forecast
  // This handles timezone issues by using the actual market event dates
  const dateCounts = new Map<string, number>();
  for (const market of markets) {
    const dateStr = market.eventDate.toISOString().split("T")[0];
    dateCounts.set(dateStr, (dateCounts.get(dateStr) || 0) + 1);
  }

  // Get the most common date (typically today or tomorrow in market's local time)
  let targetDateStr = Array.from(dateCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Fallback to tomorrow if no markets found
  if (!targetDateStr) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDateStr = tomorrow.toISOString().split("T")[0];
  }

  // Fetch real NWS forecast for the target date
  let forecast: NormalizedForecast;
  let distribution: TemperatureDistribution;

  try {
    // Parse the target date and set to noon to avoid timezone issues
    const [year, month, day] = targetDateStr.split("-").map(Number);
    const targetDate = new Date(year, month - 1, day, 12, 0, 0);
    forecast = await nwsClient.getForecastForCity(city, targetDate);
    distribution = nwsClient.buildDistribution(forecast);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`NWS API error: ${msg}`);
  }

  return {
    markets,
    quotes,
    forecast,
    distribution,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const minConfidence = parseFloat(searchParams.get("minConfidence") || "0");

    // Get configured city from database
    const settings = await loadSettingsFromDb();
    const city = settings.city;

    // Fetch real data only - no mock fallback
    const { markets, quotes, forecast, distribution } = await fetchData(city);

    // Filter markets to match forecast date if possible
    const forecastDate = forecast.targetDate.toISOString().split("T")[0];
    const matchingMarkets = markets.filter((m) => {
      const marketDate = m.eventDate.toISOString().split("T")[0];
      return marketDate === forecastDate;
    });

    // Use matching markets or all markets if none match
    const marketsToAnalyze = matchingMarkets.length > 0 ? matchingMarkets : markets;
    const quotesToAnalyze = quotes.filter((q) =>
      marketsToAnalyze.some((m) => m.id === q.marketId)
    );

    // Calculate model probabilities
    const modelProbs = calculateModelProbabilities(distribution, marketsToAnalyze);

    // Detect edges
    const allEdges = detectEdges(marketsToAnalyze, quotesToAnalyze, modelProbs, {
      minConfidence,
    });

    // Get summary
    const summary = summarizeEdges(allEdges);

    return NextResponse.json({
      success: true,
      edges: allEdges,
      summary,
      forecast: {
        station: forecast.station,
        targetDate: forecast.targetDate,
        pointForecast: forecast.pointForecast,
        forecastLow: forecast.forecastLow,
        forecastHigh: forecast.forecastHigh,
        stdDev: forecast.stdDev,
        source: forecast.source,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error detecting edges:", error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        hint: "Make sure KALSHI_API_KEY is set in your .env file for market data",
        edges: [],
        summary: null,
        forecast: null,
      },
      { status: 500 }
    );
  }
}
