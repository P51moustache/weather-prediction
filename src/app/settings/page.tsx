"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StrategyConfig {
  mode: "paper" | "live";
  minNetEdge: number;
  minConfidence: number;
  minHoursToEvent: number;
  maxHoursToEvent: number;
  maxStakePerContract: number;
  maxStakePerDay: number;
  maxExposure: number;
  maxDailyLoss: number;
  useKellyCriterion: boolean;
  kellyFraction: number;
}

interface DailyStats {
  date: string;
  totalStaked: number;
  totalPnL: number;
  tradesExecuted: number;
  tradesSkipped: number;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setConfig(data.config);
      setDailyStats(data.dailyStats);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSetting = async (key: keyof StrategyConfig, value: unknown) => {
    if (!config) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error("Failed to update setting:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <main className="min-h-screen bg-background p-8">
        <p className="text-muted-foreground">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Strategy Settings</h1>
            <p className="text-muted-foreground">Configure trading parameters</p>
          </div>
          <Link href="/">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Trading Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Trading Mode
                <Badge variant={config.mode === "live" ? "destructive" : "secondary"}>
                  {config.mode.toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Paper mode simulates trades. Live mode places real orders (requires API credentials).
              </p>
              <div className="flex gap-2">
                <Button
                  variant={config.mode === "paper" ? "default" : "outline"}
                  onClick={() => updateSetting("mode", "paper")}
                  disabled={saving}
                >
                  Paper
                </Button>
                <Button
                  variant={config.mode === "live" ? "default" : "outline"}
                  onClick={() => updateSetting("mode", "live")}
                  disabled={saving}
                >
                  Live
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Daily Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyStats && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{dailyStats.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Staked:</span>
                    <span>${dailyStats.totalStaked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total P&L:</span>
                    <span className={dailyStats.totalPnL >= 0 ? "text-green-600" : "text-red-600"}>
                      ${dailyStats.totalPnL}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trades Executed:</span>
                    <span>{dailyStats.tradesExecuted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trades Skipped:</span>
                    <span>{dailyStats.tradesSkipped}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edge Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle>Edge Thresholds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Min Net Edge (%)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={(config.minNetEdge * 100).toFixed(0)}
                  onChange={(e) => updateSetting("minNetEdge", parseFloat(e.target.value) / 100)}
                  min={0}
                  max={100}
                  step={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Min Confidence (%)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={(config.minConfidence * 100).toFixed(0)}
                  onChange={(e) => updateSetting("minConfidence", parseFloat(e.target.value) / 100)}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            </CardContent>
          </Card>

          {/* Time Horizon */}
          <Card>
            <CardHeader>
              <CardTitle>Time Horizon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Min Hours to Event</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.minHoursToEvent}
                  onChange={(e) => updateSetting("minHoursToEvent", parseInt(e.target.value))}
                  min={0}
                  step={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Hours to Event</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.maxHoursToEvent}
                  onChange={(e) => updateSetting("maxHoursToEvent", parseInt(e.target.value))}
                  min={1}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>

          {/* Risk Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Max Stake Per Contract ($)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.maxStakePerContract}
                  onChange={(e) => updateSetting("maxStakePerContract", parseInt(e.target.value))}
                  min={1}
                  step={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Stake Per Day ($)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.maxStakePerDay}
                  onChange={(e) => updateSetting("maxStakePerDay", parseInt(e.target.value))}
                  min={1}
                  step={50}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Total Exposure ($)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.maxExposure}
                  onChange={(e) => updateSetting("maxExposure", parseInt(e.target.value))}
                  min={1}
                  step={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Daily Loss ($)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={config.maxDailyLoss}
                  onChange={(e) => updateSetting("maxDailyLoss", parseInt(e.target.value))}
                  min={1}
                  step={50}
                />
              </div>
            </CardContent>
          </Card>

          {/* Kelly Criterion */}
          <Card>
            <CardHeader>
              <CardTitle>Stake Sizing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useKelly"
                  checked={config.useKellyCriterion}
                  onChange={(e) => updateSetting("useKellyCriterion", e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="useKelly" className="text-sm font-medium">
                  Use Kelly Criterion
                </label>
              </div>
              {config.useKellyCriterion && (
                <div>
                  <label className="text-sm font-medium">Kelly Fraction (0-1)</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={config.kellyFraction}
                    onChange={(e) => updateSetting("kellyFraction", parseFloat(e.target.value))}
                    min={0.1}
                    max={1}
                    step={0.05}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0.25 = quarter Kelly (conservative), 0.5 = half Kelly (moderate)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
