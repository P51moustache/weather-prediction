import {
  NWSPointResponse,
  NWSForecastResponse,
  NWSGridDataResponse,
  StationConfig,
  NormalizedForecast,
  TemperatureDistribution,
} from "./types";

const NWS_BASE_URL = "https://api.weather.gov";

// Station configurations for cities we support
export const STATION_CONFIGS: Record<string, StationConfig> = {
  KLAX: {
    id: "KLAX",
    name: "Los Angeles International Airport",
    lat: 33.9425,
    lon: -118.408,
  },
  KNYC: {
    id: "KNYC",
    name: "New York City Central Park",
    lat: 40.7789,
    lon: -73.9692,
  },
};

export class NWSClient {
  private userAgent: string;
  private cache: Map<string, { data: unknown; expires: Date }> = new Map();
  private cacheTTL: number = 15 * 60 * 1000; // 15 minutes

  constructor(userAgent?: string) {
    // NWS requires a user agent with contact info
    this.userAgent =
      userAgent || "(weather-edge-dashboard, contact@example.com)";
  }

  private async request<T>(endpoint: string): Promise<T> {
    const url = `${NWS_BASE_URL}${endpoint}`;

    // Check cache
    const cached = this.cache.get(url);
    if (cached && cached.expires > new Date()) {
      return cached.data as T;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/geo+json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `NWS API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Cache the response
    this.cache.set(url, {
      data,
      expires: new Date(Date.now() + this.cacheTTL),
    });

    return data;
  }

  /**
   * Get the grid point for a lat/lon location
   */
  async getPoint(lat: number, lon: number): Promise<NWSPointResponse> {
    return this.request<NWSPointResponse>(
      `/points/${lat.toFixed(4)},${lon.toFixed(4)}`
    );
  }

  /**
   * Get the forecast for a location
   */
  async getForecast(lat: number, lon: number): Promise<NWSForecastResponse> {
    const point = await this.getPoint(lat, lon);
    const forecastUrl = point.properties.forecast.replace(NWS_BASE_URL, "");
    return this.request<NWSForecastResponse>(forecastUrl);
  }

  /**
   * Get detailed grid data (includes hourly temps)
   */
  async getGridData(lat: number, lon: number): Promise<NWSGridDataResponse> {
    const point = await this.getPoint(lat, lon);
    const gridDataUrl = point.properties.forecastGridData.replace(
      NWS_BASE_URL,
      ""
    );
    return this.request<NWSGridDataResponse>(gridDataUrl);
  }

  /**
   * Get forecast for a specific station
   */
  async getStationForecast(stationId: string): Promise<NWSForecastResponse> {
    const station = STATION_CONFIGS[stationId];
    if (!station) {
      throw new Error(`Unknown station: ${stationId}`);
    }
    return this.getForecast(station.lat, station.lon);
  }

  /**
   * Convert Celsius to Fahrenheit
   */
  private celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9) / 5 + 32;
  }

  /**
   * Extract high temperature forecast for a specific date
   */
  async getHighTempForecast(
    stationId: string,
    targetDate: Date
  ): Promise<NormalizedForecast> {
    const station = STATION_CONFIGS[stationId];
    if (!station) {
      throw new Error(`Unknown station: ${stationId}`);
    }

    const forecast = await this.getForecast(station.lat, station.lon);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Find the daytime period for the target date
    const daytimePeriod = forecast.properties.periods.find((period) => {
      const periodDate = new Date(period.startTime)
        .toISOString()
        .split("T")[0];
      return periodDate === targetDateStr && period.isDaytime;
    });

    if (!daytimePeriod) {
      throw new Error(`No forecast found for ${targetDateStr}`);
    }

    // NWS provides point forecast, estimate uncertainty based on forecast horizon
    const hoursAhead =
      (targetDate.getTime() - Date.now()) / (1000 * 60 * 60);

    // Uncertainty increases with forecast horizon
    // Day 1: ~2°F std dev, Day 2: ~3°F, Day 3: ~4°F
    const baseStdDev = 2;
    const stdDev = baseStdDev + Math.floor(hoursAhead / 24) * 0.5;

    const pointForecast = daytimePeriod.temperature;

    return {
      station: stationId,
      targetDate,
      fetchedAt: new Date(),
      source: "NWS",
      pointForecast,
      forecastLow: pointForecast - 2 * stdDev,
      forecastHigh: pointForecast + 2 * stdDev,
      stdDev,
      rawData: JSON.stringify(daytimePeriod),
    };
  }

  /**
   * Build a temperature distribution for probability calculations
   */
  buildDistribution(forecast: NormalizedForecast): TemperatureDistribution {
    return {
      mean: forecast.pointForecast,
      stdDev: forecast.stdDev,
    };
  }

  /**
   * Get LA high temperature forecast
   */
  async getLAForecast(targetDate: Date): Promise<NormalizedForecast> {
    return this.getHighTempForecast("KLAX", targetDate);
  }

  /**
   * Get NYC high temperature forecast
   */
  async getNYCForecast(targetDate: Date): Promise<NormalizedForecast> {
    return this.getHighTempForecast("KNYC", targetDate);
  }

  /**
   * Get forecast for a city
   */
  async getForecastForCity(city: string, targetDate: Date): Promise<NormalizedForecast> {
    if (city === "los_angeles") {
      return this.getLAForecast(targetDate);
    } else if (city === "new_york") {
      return this.getNYCForecast(targetDate);
    }
    throw new Error(`Unknown city: ${city}`);
  }
}

// Export singleton instance
export const nwsClient = new NWSClient();
