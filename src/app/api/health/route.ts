import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kalshiClient } from "@/connectors/kalshi";
import { nwsClient } from "@/connectors/weatherModels";
import { loadSettingsFromDb } from "@/core/executionEngine";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: {
      status: "up" | "down";
      latencyMs?: number;
    };
    kalshiApi: {
      status: "up" | "down" | "not_configured";
      error?: string;
      marketsFound?: number;
      city?: string;
    };
    nwsApi: {
      status: "up" | "down";
      error?: string;
    };
  };
  stats: {
    totalMarkets: number;
    totalForecasts: number;
    totalEdges: number;
    lastEdgeDetection?: string;
  };
  timestamp: string;
}

export async function GET() {
  const health: HealthStatus = {
    status: "healthy",
    checks: {
      database: { status: "down" },
      kalshiApi: { status: "down" },
      nwsApi: { status: "down" },
    },
    stats: {
      totalMarkets: 0,
      totalForecasts: 0,
      totalEdges: 0,
    },
    timestamp: new Date().toISOString(),
  };

  // Check database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: "up",
      latencyMs: Date.now() - start,
    };

    // Get stats
    const [marketsCount, forecastsCount, edgesCount, lastEdge] =
      await Promise.all([
        prisma.market.count(),
        prisma.forecast.count(),
        prisma.edge.count(),
        prisma.edge.findFirst({
          orderBy: { timestamp: "desc" },
          select: { timestamp: true },
        }),
      ]);

    health.stats = {
      totalMarkets: marketsCount,
      totalForecasts: forecastsCount,
      totalEdges: edgesCount,
      lastEdgeDetection: lastEdge?.timestamp.toISOString(),
    };
  } catch (error) {
    console.error("Database health check failed:", error);
    health.checks.database = { status: "down" };
  }

  // Check Kalshi API - test connectivity for configured city
  const settings = await loadSettingsFromDb();
  const configuredCity = settings.city;
  const cityLabel = configuredCity === "los_angeles" ? "Los Angeles" : "New York";

  try {
    const kalshiData = await kalshiClient.getTemperatureMarkets(configuredCity);
    if (kalshiData.markets.length > 0) {
      health.checks.kalshiApi = {
        status: "up",
        marketsFound: kalshiData.markets.length,
        city: configuredCity,
      };
    } else {
      health.checks.kalshiApi = {
        status: "down",
        error: `No ${cityLabel} temperature markets found`,
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("API key") || msg.includes("401") || msg.includes("403") || msg.includes("credentials")) {
      health.checks.kalshiApi = {
        status: "not_configured",
        error: "KALSHI_API_KEY not set in .env",
      };
    } else {
      health.checks.kalshiApi = {
        status: "down",
        error: msg,
      };
    }
  }

  // Check NWS API - actually test connectivity
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await nwsClient.getLAForecast(tomorrow);
    health.checks.nwsApi = { status: "up" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    health.checks.nwsApi = {
      status: "down",
      error: msg,
    };
  }

  // Determine overall status
  if (health.checks.database.status === "down") {
    health.status = "unhealthy";
  } else if (
    health.checks.kalshiApi.status === "down" ||
    health.checks.kalshiApi.status === "not_configured" ||
    health.checks.nwsApi.status === "down"
  ) {
    health.status = "degraded";
  }

  const statusCode = health.status === "unhealthy" ? 503 : 200;
  return NextResponse.json(health, { status: statusCode });
}
