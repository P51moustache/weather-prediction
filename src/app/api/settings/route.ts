import { NextRequest, NextResponse } from "next/server";
import {
  executionEngine,
  StrategyConfig,
  DEFAULT_STRATEGY_CONFIG,
  loadSettingsFromDb,
  saveSettingsToDb,
  City,
} from "@/core/executionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  // Load persisted settings from database
  const dbSettings = await loadSettingsFromDb();

  // Merge with in-memory config
  const config = {
    ...executionEngine.getConfig(),
    city: dbSettings.city,
    mode: dbSettings.mode,
  };

  const dailyStats = executionEngine.getDailyStats();

  return NextResponse.json({
    config,
    dailyStats,
    defaults: DEFAULT_STRATEGY_CONFIG,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updates: Partial<StrategyConfig> = {};
    const dbUpdates: { city?: City; mode?: "paper" | "live" } = {};

    // Validate and apply updates
    if (body.mode && (body.mode === "paper" || body.mode === "live")) {
      updates.mode = body.mode;
      dbUpdates.mode = body.mode;
    }
    if (body.city && (body.city === "los_angeles" || body.city === "new_york")) {
      updates.city = body.city;
      dbUpdates.city = body.city;
    }
    if (typeof body.minExpectedProfit === "number" && body.minExpectedProfit >= 0 && body.minExpectedProfit <= 1) {
      updates.minExpectedProfit = body.minExpectedProfit;
    }
    if (typeof body.minConfidence === "number" && body.minConfidence >= 0 && body.minConfidence <= 1) {
      updates.minConfidence = body.minConfidence;
    }
    if (typeof body.minHoursToEvent === "number" && body.minHoursToEvent >= 0) {
      updates.minHoursToEvent = body.minHoursToEvent;
    }
    if (typeof body.maxHoursToEvent === "number" && body.maxHoursToEvent >= 0) {
      updates.maxHoursToEvent = body.maxHoursToEvent;
    }
    if (typeof body.maxStakePerContract === "number" && body.maxStakePerContract >= 0) {
      updates.maxStakePerContract = body.maxStakePerContract;
    }
    if (typeof body.maxStakePerDay === "number" && body.maxStakePerDay >= 0) {
      updates.maxStakePerDay = body.maxStakePerDay;
    }
    if (typeof body.maxExposure === "number" && body.maxExposure >= 0) {
      updates.maxExposure = body.maxExposure;
    }
    if (typeof body.maxDailyLoss === "number" && body.maxDailyLoss >= 0) {
      updates.maxDailyLoss = body.maxDailyLoss;
    }
    if (typeof body.useKellyCriterion === "boolean") {
      updates.useKellyCriterion = body.useKellyCriterion;
    }
    if (typeof body.kellyFraction === "number" && body.kellyFraction > 0 && body.kellyFraction <= 1) {
      updates.kellyFraction = body.kellyFraction;
    }

    // Save city and mode to database for persistence
    if (Object.keys(dbUpdates).length > 0) {
      await saveSettingsToDb(dbUpdates);
    }

    // Update in-memory config
    executionEngine.updateConfig(updates);

    // Return merged config
    const dbSettings = await loadSettingsFromDb();
    const config = {
      ...executionEngine.getConfig(),
      city: dbSettings.city,
      mode: dbSettings.mode,
    };

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 400 }
    );
  }
}
