"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HealthStatus } from "@/components/HealthStatus";
import { EdgeTable } from "@/components/EdgeTable";
import { ForecastCard } from "@/components/ForecastCard";
import { SummaryCards } from "@/components/SummaryCards";
import { PositionsCard } from "@/components/PositionsCard";

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

interface Edge {
  marketId: string;
  ticker: string;
  question: string;
  bracketLow: number | null;
  bracketHigh: number | null;
  eventDate: string;
  modelProbability: number;
  marketProbability: number;
  expectedProfit: number;      // Expected $ profit per contract
  expectedProfitYes: number;   // Expected $ if buying YES
  expectedProfitNo: number;    // Expected $ if buying NO
  confidence: number;
  direction: "BUY_YES" | "BUY_NO" | "NO_TRADE";
  volume: number;
}

interface EdgeSummary {
  totalMarkets: number;
  marketsWithEdge: number;
  avgExpectedProfit: number;    // Average $ profit across all markets
  totalExpectedProfit: number;  // Sum of positive expected profits
  avgConfidence: number;
  buyYesCount: number;
  buyNoCount: number;
}

interface Forecast {
  station: string;
  targetDate: string;
  pointForecast: number;
  forecastLow: number;
  forecastHigh: number;
  stdDev: number;
  source: string;
}

interface Position {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
}

interface AccountData {
  balance: number;
  positions: Position[];
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  mode: "paper" | "live";
}

type City = "los_angeles" | "new_york";

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [summary, setSummary] = useState<EdgeSummary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [city, setCity] = useState<City>("los_angeles");
  const [changingCity, setChangingCity] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch health, edges, account, and settings data in parallel
      const [healthRes, edgesRes, accountRes, settingsRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/edges"),
        fetch("/api/account"),
        fetch("/api/settings"),
      ]);

      const healthData = await healthRes.json();
      setHealth(healthData);

      const edgesData = await edgesRes.json();
      if (edgesData.success) {
        setEdges(edgesData.edges);
        setSummary(edgesData.summary);
        if (edgesData.forecast) {
          setForecast(edgesData.forecast);
        }
      } else {
        // Clear edges data on error (e.g., when city has no markets)
        setEdges([]);
        setSummary(null);
        setForecast(null);
      }

      const accountData = await accountRes.json();
      if (accountData.success) {
        setAccount(accountData);
      }

      const settingsData = await settingsRes.json();
      if (settingsData.config?.city) {
        setCity(settingsData.config.city);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLastSync(new Date().toLocaleTimeString());
        // Refresh data after sync
        await fetchData();
      } else {
        // Show error message
        setSyncError(data.error || "Sync failed");
        // Still refresh to show current state
        await fetchData();
      }
    } catch (error) {
      console.error("Sync failed:", error);
      setSyncError("Network error during sync");
    } finally {
      setSyncing(false);
    }
  };

  const handleCityChange = async (newCity: City) => {
    setChangingCity(true);
    setSyncError(null); // Clear any previous error
    try {
      // Update the setting
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: newCity }),
      });
      const data = await res.json();
      if (data.success) {
        setCity(newCity);
        // Refresh all data for the new city
        await fetchData();
      }
    } catch (error) {
      console.error("Failed to change city:", error);
    } finally {
      setChangingCity(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Weather Edge Dashboard</h1>
            <p className="text-muted-foreground">
              Temperature Market Analysis
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select
              value={city}
              onValueChange={(value) => handleCityChange(value as City)}
              disabled={changingCity || syncing}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="los_angeles">Los Angeles</SelectItem>
                <SelectItem value="new_york">New York</SelectItem>
              </SelectContent>
            </Select>
            {lastSync && (
              <span className="text-sm text-muted-foreground">
                Last sync: {lastSync}
              </span>
            )}
            <Button onClick={handleSync} disabled={syncing || changingCity}>
              {syncing ? "Syncing..." : "Sync Data"}
            </Button>
            <Link href="/settings">
              <Button variant="outline">Settings</Button>
            </Link>
            <Link href="/logs">
              <Button variant="outline">Logs</Button>
            </Link>
          </div>
        </div>

        {/* Sync Error Alert */}
        {syncError && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400 text-sm">
              <strong>Sync Error:</strong> {syncError}
            </p>
            {city === "los_angeles" && (
              <p className="text-red-600 dark:text-red-500 text-xs mt-1">
                Tip: Los Angeles temperature markets may not be available. Try switching to New York.
              </p>
            )}
          </div>
        )}

        {/* Summary Cards */}
        <div className="mb-8">
          <SummaryCards summary={summary} loading={loading} />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Forecast, Positions & Health */}
          <div className="space-y-4">
            <ForecastCard forecast={forecast} loading={loading} city={city} />
            <PositionsCard account={account} loading={loading} />
            <HealthStatus data={health} loading={loading} />
          </div>

          {/* Right Column - Edge Table */}
          <div className="lg:col-span-2">
            <EdgeTable edges={edges} loading={loading} />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Weather Edge Dashboard - For educational/experimental use only.
          </p>
          <p className="mt-1">
            Data sources: Kalshi API, NWS/NOAA
          </p>
        </footer>
      </div>
    </main>
  );
}
