// NWS API response types

export interface NWSPointResponse {
  properties: {
    gridId: string;
    gridX: number;
    gridY: number;
    forecast: string;
    forecastHourly: string;
    forecastGridData: string;
    observationStations: string;
  };
}

export interface NWSForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  temperatureTrend: string | null;
  probabilityOfPrecipitation: {
    unitCode: string;
    value: number | null;
  };
  windSpeed: string;
  windDirection: string;
  icon: string;
  shortForecast: string;
  detailedForecast: string;
}

export interface NWSForecastResponse {
  properties: {
    updated: string;
    generatedAt: string;
    updateTime: string;
    periods: NWSForecastPeriod[];
  };
}

export interface NWSGridDataResponse {
  properties: {
    maxTemperature: {
      uom: string;
      values: Array<{
        validTime: string;
        value: number;
      }>;
    };
    minTemperature: {
      uom: string;
      values: Array<{
        validTime: string;
        value: number;
      }>;
    };
    temperature: {
      uom: string;
      values: Array<{
        validTime: string;
        value: number;
      }>;
    };
  };
}

// Station coordinates for Kalshi settlement sources
export interface StationConfig {
  id: string;
  name: string;
  lat: number;
  lon: number;
  gridId?: string;
  gridX?: number;
  gridY?: number;
}

// Normalized forecast for internal use
export interface NormalizedForecast {
  station: string;
  targetDate: Date;
  fetchedAt: Date;
  source: string;
  pointForecast: number; // Expected high temp in Fahrenheit
  forecastLow: number;   // Low end of uncertainty range
  forecastHigh: number;  // High end of uncertainty range
  stdDev: number;        // Estimated standard deviation
  rawData?: string;
}

// Distribution for probability calculations
export interface TemperatureDistribution {
  mean: number;
  stdDev: number;
  // Optional: empirical samples for non-Gaussian distributions
  samples?: number[];
}
