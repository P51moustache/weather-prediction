# Edge Detection Dashboard Design

**Date:** 2026-01-21
**Status:** Approved

## Overview

Build an Edge Detection Dashboard for LA temperature bracket markets on Kalshi. The system will:

1. **Fetch Kalshi markets** — Poll the Kalshi API for LA daily high temperature contracts, extract bracket definitions, calculate market-implied probabilities from prices.

2. **Fetch NWS forecasts** — Pull forecast data from NWS/NOAA APIs for the LAX station. Extract point forecast and uncertainty indicators.

3. **Build probability distributions** — Convert NWS point forecasts into a probability distribution (Gaussian with historical bias/variance correction). Calculate probability for each bracket.

4. **Detect edges** — Compare model-implied probability vs. market-implied probability. Flag contracts where difference exceeds threshold (>5% edge after fees).

5. **Display in dashboard** — Table of upcoming LA temperature markets with model vs. market probabilities, edge %, and confidence scores.

## Key Decisions

- **City:** Los Angeles (single city to start)
- **Contract Type:** Daily high temperature brackets
- **Weather Source:** NWS/NOAA APIs (free, official, aligns with settlement)
- **Edge Source:** Mismatch between point-estimate thinking and bracket pricing

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + TypeScript + Tailwind + shadcn/ui |
| Backend | Next.js API routes |
| Database | PostgreSQL + Prisma |
| Realtime | Server-Sent Events |
| Testing | Vitest (unit) + Playwright (E2E) |

## Folder Structure

```
weather-prediction/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── connectors/
│   │   ├── kalshi/             # Kalshi API wrapper
│   │   └── weatherModels/      # NWS/NOAA API wrapper
│   ├── core/
│   │   ├── weatherProbEngine.ts
│   │   └── edgeDetector.ts
│   ├── lib/
│   └── components/
├── prisma/
├── tests/
├── docs/plans/
├── README.md
├── DEV_FLOW.md
├── DEV_LOG.md
└── CLAUDE.md
```

## Database Schema

### Market
- id, ticker, question, category, city, station
- eventDate, bracketLow, bracketHigh, settlementSource

### MarketSnapshot
- marketId, yesPrice, noPrice, yesBid, yesAsk, volume, timestamp

### Forecast
- station, targetDate, source, pointForecast, forecastLow, forecastHigh, stdDev

### Edge
- marketId, modelProb, marketProb, grossEdge, netEdge, confidence

### SystemLog
- level, source, message, metadata, timestamp

## API Endpoints

- `GET /api/markets` — Fetch Kalshi LA temperature markets
- `GET /api/forecasts` — Fetch latest NWS forecast
- `GET /api/edges` — Computed edges for all active markets
- `GET /api/health` — System status
- `POST /api/sync` — Manual refresh trigger

## Dashboard Pages

1. **Overview (/)** — System health, last updated, quick stats
2. **Markets (/markets)** — Edge table with filters, probability visualization
3. **Market Detail (/markets/[id])** — Full calculation breakdown

## Implementation Order

1. Scaffold Next.js project
2. Set up Prisma + PostgreSQL
3. Build Kalshi connector
4. Build NWS connector
5. Build probability engine
6. Build edge detector
7. Build API routes
8. Build dashboard UI
9. Add tests
10. Documentation
