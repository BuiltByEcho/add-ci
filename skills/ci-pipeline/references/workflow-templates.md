# GitHub Actions Workflow Templates

## CI Workflow (Tier 1+2 on PR)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  NODE_VERSION: '24'
  PLAYWRIGHT_BASE_URL: ${{ vars.VERCEL_PREVIEW_URL || 'http://localhost:3000' }}

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint

  smoke-tests:
    name: Smoke Tests
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: playwright-${{ runner.os }}-

      # Option A: Test against Vercel preview
      - name: Wait for Vercel preview
        if: vars.VERCEL_PREVIEW_URL != ''
        run: npx vercel wait --token ${{ secrets.VERCEL_TOKEN }}

      # Option B: Test against local dev server
      - name: Start dev server
        if: vars.VERCEL_PREVIEW_URL == ''
        run: npm run dev &
        env:
          # Backend-specific env vars
          ${{ vars.SMOKE_TEST_ENV || '' }}

      - name: Run smoke tests
        run: npx playwright test --project=smoke
        env:
          PLAYWRIGHT_BASE_URL: ${{ vars.VERCEL_PREVIEW_URL || 'http://localhost:3000' }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

## Nightly E2E Workflow (Tier 3)

```yaml
name: E2E Nightly

on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC daily
  workflow_dispatch:       # Manual trigger

env:
  NODE_VERSION: '24'
  PLAYWRIGHT_BASE_URL: ${{ secrets.E2E_BASE_URL || 'https://your-app.vercel.app' }}

jobs:
  e2e-tests:
    name: Full E2E
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test --project=e2e
        env:
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
          # Supabase
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          # MongoDB
          MONGODB_URI: ${{ secrets.MONGODB_URI }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-report
          path: playwright-report/
          retention-days: 7

  notify-on-failure:
    needs: e2e-tests
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Notify Discord
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK }}
          title: "E2E Nightly Failed"
          description: "Full E2E test suite failed on main branch"
          color: 0xff0000
```

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel deploy token for preview URL waiting |
| `E2E_USER_EMAIL` | Test user email for auth E2E |
| `E2E_USER_PASSWORD` | Test user password for auth E2E |
| `SUPABASE_URL` | Supabase project URL (if applicable) |
| `SUPABASE_ANON_KEY` | Supabase anon key (if applicable) |
| `MONGODB_URI` | MongoDB connection string (if applicable) |
| `DISCORD_WEBHOOK` | Webhook URL for failure notifications |

## Required GitHub Variables

| Variable | Description |
|----------|-------------|
| `VERCEL_PREVIEW_URL` | Auto-set by Vercel GitHub integration (or set manually) |