import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nwsClient } from "@/connectors/weatherModels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const forecasts = [];

    // Get forecasts for next 3 days from NWS - no fallback
    for (let i = 1; i <= 3; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + i);
      targetDate.setHours(12, 0, 0, 0);

      const forecast = await nwsClient.getLAForecast(targetDate);
      forecasts.push(forecast);

      // Store in database
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

    return NextResponse.json({
      success: true,
      forecasts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching forecasts:", error);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
