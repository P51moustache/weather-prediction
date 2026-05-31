# Weather Edge Dashboard

A web application for detecting trading edges in Kalshi weather markets using quantitative weather model analysis.

## Overview

This application:
- Monitors Kalshi weather markets (LA temperature brackets)
- Ingests professional weather forecast data from NWS/NOAA
- Calculates model-implied probabilities for each temperature bracket
- Detects mispricings where model probabilities differ from market prices
- Displays opportunities in a clean dashboard interface

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: SQLite (via Prisma ORM)
- **Weather Data**: NWS/NOAA APIs
- **Market Data**: Kalshi API

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd weather-prediction

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your real Kalshi API key and RSA private-key path (required)

# Initialize database
npx prisma db push

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the dashboard.

### Environment Variables

```env
DATABASE_URL="file:./dev.db"
KALSHI_API_KEY="your_kalshi_api_key"                  # Required - the app fetches live data and errors if unset
KALSHI_PRIVATE_KEY_PATH="./kalshi-private-key.pem"    # Required - path to your Kalshi RSA private key (PEM) used to sign requests
```

> **Note:** This app fetches live data from Kalshi and the NWS. There is no mock/demo mode — `POST /api/sync` will return an error if the Kalshi credentials above are not configured. Get an API key and download the RSA private key from your Kalshi account settings, save the `.pem` file locally (it is gitignored), and point `KALSHI_PRIVATE_KEY_PATH` at it.

## Usage

1. **View Dashboard**: Open the app to see current market analysis
2. **Sync Data**: Click "Sync Data" to fetch latest markets and forecasts
3. **Analyze Edges**: Review the edge table for trading opportunities
   - Green signals (BUY YES): Model thinks YES is underpriced
   - Red signals (BUY NO): Model thinks NO is underpriced
   - HOLD: No significant edge detected

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Main dashboard
│   └── api/               # API routes
│       ├── markets/       # Kalshi market data
│       ├── forecasts/     # NWS forecast data
│       ├── edges/         # Edge calculations
│       ├── health/        # System health check
│       └── sync/          # Manual data sync
├── connectors/
│   ├── kalshi/            # Kalshi API client
│   └── weatherModels/     # NWS API client
├── core/
│   ├── weatherProbEngine.ts  # Probability calculations
│   └── edgeDetector.ts       # Edge detection logic
├── components/            # React components
└── lib/                   # Shared utilities
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health status |
| `/api/markets` | GET | Fetch Kalshi weather markets |
| `/api/forecasts` | GET | Fetch NWS forecasts |
| `/api/edges` | GET | Get calculated edges |
| `/api/sync` | POST | Trigger data sync |

## Development

```bash
# Run development server
npm run dev

# Run type checking
npx tsc --noEmit

# Run linter
npm run lint

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

## How It Works

### Edge Detection Algorithm

1. **Fetch Market Data**: Get current Kalshi temperature bracket prices
2. **Fetch Forecast**: Get NWS point forecast and uncertainty for LAX station
3. **Build Distribution**: Create Gaussian probability distribution from forecast
4. **Calculate Probabilities**: Use CDF to calculate probability for each bracket
5. **Compare to Market**: Identify where model probability differs from market price
6. **Score Confidence**: Factor in forecast horizon, model uncertainty, and liquidity

### Probability Engine

The engine uses a Gaussian model for temperature distribution:
- Mean = NWS point forecast
- Std Dev = Base uncertainty (2°F) + horizon adjustment

For each bracket [low, high], probability = CDF(high) - CDF(low)

### Edge Calculation

```
Gross Edge = Model Probability - Market Probability
Net Edge = Gross Edge - Spread Cost - Expected Fee
```

Signals are generated when:
- Net edge exceeds threshold (default 5%)
- Confidence score is above minimum (default 60%)
- Event is within time horizon (1-72 hours)

## Disclaimer

This application is for **educational and experimental purposes only**. It does not constitute financial advice. Use at your own risk. Always respect Kalshi's terms of service and applicable laws.

## License

MIT
