"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EdgeSummary {
  totalMarkets: number;
  marketsWithEdge: number;
  avgExpectedProfit: number;    // Average $ profit across all markets
  totalExpectedProfit: number;  // Sum of positive expected profits
  avgConfidence: number;
  buyYesCount: number;
  buyNoCount: number;
}

interface SummaryCardsProps {
  summary: EdgeSummary | null;
  loading: boolean;
}

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // No data available (e.g., city has no markets)
  const displaySummary = summary || {
    totalMarkets: 0,
    marketsWithEdge: 0,
    avgExpectedProfit: 0,
    totalExpectedProfit: 0,
    avgConfidence: 0,
    buyYesCount: 0,
    buyNoCount: 0,
  };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Markets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{displaySummary.totalMarkets}</div>
          <p className="text-xs text-muted-foreground">
            Temperature brackets
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{displaySummary.marketsWithEdge}</div>
          <p className="text-xs text-muted-foreground">
            Markets with tradeable edge
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Expected Profit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {displaySummary.avgExpectedProfit >= 0 ? "+" : ""}
            ${displaySummary.avgExpectedProfit.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">
            Total: ${displaySummary.totalExpectedProfit.toFixed(2)} (all +EV)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            <span className="text-green-600">{displaySummary.buyYesCount}</span>
            {" / "}
            <span className="text-red-600">{displaySummary.buyNoCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Buy Yes / Buy No signals
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
