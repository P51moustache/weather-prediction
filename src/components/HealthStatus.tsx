"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: { status: "up" | "down"; latencyMs?: number };
    kalshiApi: { status: "up" | "down" | "not_configured"; error?: string; marketsFound?: number; city?: string };
    nwsApi: { status: "up" | "down"; error?: string };
  };
  stats: {
    totalMarkets: number;
    totalForecasts: number;
    totalEdges: number;
    lastEdgeDetection?: string;
  };
}

interface HealthStatusProps {
  data: HealthData | null;
  loading: boolean;
}

export function HealthStatus({ data, loading }: HealthStatusProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="destructive">Unable to connect</Badge>
        </CardContent>
      </Card>
    );
  }

  const statusVariant =
    data.status === "healthy"
      ? "default"
      : data.status === "degraded"
      ? "secondary"
      : "destructive";

  const getKalshiBadge = () => {
    const { kalshiApi } = data.checks;
    if (kalshiApi.status === "up") {
      const cityLabel = kalshiApi.city === "new_york" ? "NYC" : kalshiApi.city === "los_angeles" ? "LA" : "";
      return (
        <Badge variant="default">
          up ({kalshiApi.marketsFound} {cityLabel} markets)
        </Badge>
      );
    } else if (kalshiApi.status === "not_configured") {
      return <Badge variant="destructive">not configured</Badge>;
    } else {
      return <Badge variant="destructive">down</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">System Health</CardTitle>
        <Badge variant={statusVariant}>{data.status.toUpperCase()}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Database</span>
            <Badge
              variant={data.checks.database.status === "up" ? "default" : "destructive"}
            >
              {data.checks.database.status}
              {data.checks.database.latencyMs && ` (${data.checks.database.latencyMs}ms)`}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span>Kalshi API</span>
            {getKalshiBadge()}
          </div>
          {data.checks.kalshiApi.status === "not_configured" && (
            <p className="text-xs text-red-500 ml-2">
              Set KALSHI_API_KEY in .env
            </p>
          )}
          {data.checks.kalshiApi.status === "down" && data.checks.kalshiApi.error && (
            <p className="text-xs text-red-500 ml-2">
              {data.checks.kalshiApi.error}
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span>NWS API</span>
            <Badge
              variant={data.checks.nwsApi.status === "up" ? "default" : "destructive"}
            >
              {data.checks.nwsApi.status}
            </Badge>
          </div>
          {data.checks.nwsApi.status === "down" && data.checks.nwsApi.error && (
            <p className="text-xs text-red-500 ml-2">
              {data.checks.nwsApi.error}
            </p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t space-y-1">
          <p className="text-xs text-muted-foreground">
            Markets tracked: {data.stats.totalMarkets}
          </p>
          <p className="text-xs text-muted-foreground">
            Forecasts: {data.stats.totalForecasts}
          </p>
          <p className="text-xs text-muted-foreground">
            Edge calculations: {data.stats.totalEdges}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
