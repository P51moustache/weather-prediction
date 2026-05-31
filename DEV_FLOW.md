# Development Flow

This document describes the development workflow for the Weather Edge Dashboard.

## Development Loop

For each feature or change, follow this cycle:

### 1. Plan
- Restate requirement and acceptance criteria
- Identify relevant skills/tools
- List files to create/modify
- List tests to add/update

### 2. Design
- Backend: endpoints, data models, error handling
- Frontend: screens, states, component hierarchy
- Document trade-offs and assumptions

### 3. Implement
- Make small, focused changes
- Keep code typed and consistent
- Update docs/comments for non-obvious logic

### 4. Quality Checks
- Run lint: `npm run lint`
- Run type check: `npx tsc --noEmit`
- Run tests: `npm test`
- Fix any issues before proceeding

### 5. UI/UX Verification
- Check component hierarchy and spacing
- Verify loading/empty/error states
- Ensure accessibility basics

### 6. Summarize & Log
- Update DEV_LOG.md with changes
- Include status: PLANNING / IMPLEMENTING / TESTING / READY FOR REVIEW

## Commands

```bash
# Development
npm run dev          # Start dev server on port 3000

# Database
npm run db:push      # Push schema changes
npm run db:generate  # Regenerate Prisma client
npm run db:studio    # Open Prisma Studio

# Quality
npm run lint         # Run ESLint
npm run build        # Production build (includes type check)

# Testing
npm test             # Run unit tests
npm run test:e2e     # Run Playwright tests
```

## Git Workflow

1. Create feature branch from main
2. Make changes following the development loop
3. Run all quality checks
4. Commit with descriptive message
5. Open PR for review

## Environment Setup

1. Copy `.env.example` to `.env`
2. Set `KALSHI_API_KEY` and `KALSHI_PRIVATE_KEY_PATH` (path to your Kalshi RSA private-key `.pem`). These are required — there is no mock mode.
3. Run `npx prisma db push` to initialize database

## Live Data Only

This app fetches live data from Kalshi and the NWS; it does **not** ship a mock/demo mode:
- `POST /api/sync` returns an error if Kalshi credentials are missing or the APIs are unreachable.
- Un-quoted markets (no resting bid/ask) are handled gracefully and simply produce no edge, rather than crashing the sync.

## Troubleshooting

### Database Issues
```bash
# Reset database
rm prisma/dev.db
npx prisma db push
```

### Type Errors
```bash
# Regenerate Prisma types
npx prisma generate
```

### Build Failures
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```
