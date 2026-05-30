"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

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

interface EdgeTableProps {
  edges: Edge[];
  loading: boolean;
}

function formatBracket(low: number | null, high: number | null): string {
  // Match Kalshi's user-friendly display format
  if (low === null && high !== null) {
    // "< 62" means "61 or below" (max winning temp is high - 1)
    return `${high - 1}° or below`;
  }
  if (low !== null && high === null) {
    // "> 69" means "70 or above" (min winning temp is low + 1)
    return `${low + 1}° or above`;
  }
  if (low !== null && high !== null) {
    return `${low}° to ${high}°`;
  }
  return "Unknown";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDollar(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getKalshiUrl(ticker: string): string {
  // Extract series ticker and event ticker from full market ticker
  // Format: KXHIGHNY-26JAN22-T40 -> series is KXHIGHNY, event is KXHIGHNY-26JAN22
  // Kalshi only supports linking to events, not specific brackets
  const parts = ticker.split("-");
  const seriesTicker = parts[0]?.toLowerCase() || ticker.toLowerCase();
  // Event ticker is series + date (first two parts)
  const eventTicker = parts.length >= 2
    ? `${parts[0]}-${parts[1]}`.toLowerCase()
    : ticker.toLowerCase();

  // Map series tickers to their Kalshi URL slugs
  if (seriesTicker === "kxhighny") {
    return `https://kalshi.com/markets/kxhighny/highest-temperature-in-nyc/${eventTicker}`;
  }
  if (seriesTicker === "kxhighlax") {
    return `https://kalshi.com/markets/kxhighlax/highest-temperature-in-los-angeles/${eventTicker}`;
  }

  // Fallback to category page
  return "https://kalshi.com/category/climate";
}

export function EdgeTable({ edges, loading }: EdgeTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Edge Detection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading edges...</p>
        </CardContent>
      </Card>
    );
  }

  // Determine city and event URL from first edge if available
  const city = edges.length > 0 && edges[0].ticker.includes("NY") ? "NYC" : "LA";
  const eventUrl = edges.length > 0 ? getKalshiUrl(edges[0].ticker) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Edge Detection - {city} Temperature Markets</CardTitle>
        {eventUrl && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={eventUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Kalshi <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bracket</TableHead>
              <TableHead className="text-right">Model</TableHead>
              <TableHead className="text-right">Market</TableHead>
              <TableHead className="text-right">Edge</TableHead>
              <TableHead className="text-right">Confidence</TableHead>
              <TableHead>Signal</TableHead>
              <TableHead className="text-center">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {edges.map((edge) => {
              // Color based on expected profit: green if positive, red if negative
              const edgeColor =
                edge.expectedProfit > 0.03
                  ? "text-green-600"
                  : edge.expectedProfit < -0.03
                  ? "text-red-600"
                  : "text-muted-foreground";

              return (
                <TableRow key={edge.marketId}>
                  <TableCell className="font-medium">
                    {formatDate(edge.eventDate)}
                  </TableCell>
                  <TableCell>
                    {formatBracket(edge.bracketLow, edge.bracketHigh)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(edge.modelProbability)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(edge.marketProbability)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${edgeColor}`}>
                    {formatDollar(edge.expectedProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(edge.confidence * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell>
                    {edge.direction === "BUY_YES" ? (
                      <Badge variant="default">BUY YES</Badge>
                    ) : edge.direction === "BUY_NO" ? (
                      <Badge variant="secondary">BUY NO</Badge>
                    ) : (
                      <Badge variant="outline">NO TRADE</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a
                        href={getKalshiUrl(edge.ticker)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`View ${edge.ticker} on Kalshi`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {edges.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No edges detected. Run sync to fetch latest data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
