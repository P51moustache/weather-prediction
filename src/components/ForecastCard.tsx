"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Forecast {
  station: string;
  targetDate: string;
  pointForecast: number;
  forecastLow?: number;
  forecastHigh?: number;
  stdDev: number;
  source?: string;
}

interface ForecastCardProps {
  forecast: Forecast | null;
  loading: boolean;
  city?: string;
}

export function ForecastCard({ forecast, loading, city }: ForecastCardProps) {
  // Get city display name
  const cityName = city === "los_angeles" ? "Los Angeles" : city === "new_york" ? "New York" : "Weather";
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading forecast...</p>
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No forecast available</p>
        </CardContent>
      </Card>
    );
  }

  const targetDate = new Date(forecast.targetDate);
  const dateStr = targetDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Calculate range from stdDev if not provided
  const rangeLow = forecast.forecastLow ?? forecast.pointForecast - 2 * forecast.stdDev;
  const rangeHigh = forecast.forecastHigh ?? forecast.pointForecast + 2 * forecast.stdDev;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {cityName} Forecast - {dateStr}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold">{forecast.pointForecast}°F</div>
        <p className="text-sm text-muted-foreground mt-1">
          Range: {rangeLow.toFixed(0)}°F - {rangeHigh.toFixed(0)}°F
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Uncertainty: ±{forecast.stdDev.toFixed(1)}°F
        </p>
        <p className="text-xs text-muted-foreground">
          Source: {forecast.source || "NWS"} ({forecast.station})
        </p>
      </CardContent>
    </Card>
  );
}
