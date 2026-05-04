#!/usr/bin/env bash
# add-ci.sh — Add CI/CD pipeline to an existing project
# Supports: npm, pnpm, yarn | Next.js, Vite, monorepo | Supabase, MongoDB, none

set -euo pipefail

PROJECT_DIR=""
BACKEND="auto"
FRAMEWORK="auto"
TIER=2
SKIP_VERCEL=false
SKIP_INSTALL=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)     BACKEND="$2"; shift 2 ;;
    --framework)   FRAMEWORK="$2"; shift 2 ;;
    --tier)        TIER="$2"; shift 2 ;;
    --skip-vercel) SKIP_VERCEL=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --force)       FORCE=true; shift ;;
    -h|--help)
      echo "Usage: add-ci.sh /path/to/project [options]"
      echo "  --backend supabase|mongodb|none|auto  Backend type (default: auto)"
      echo "  --framework nextjs|vite|auto           Framework (default: auto)"
      echo "  --tier 1|2|3                          Max tier to set up (default: 2)"
      echo "  --skip-vercel                         Skip Vercel integration"
      echo "  --skip-install                        Skip dependency install"
      echo "  --force                               Overwrite existing files"
      exit 0 ;;
    *)
      if [[ -z "$PROJECT_DIR" ]]; then
        PROJECT_DIR="$1"; shift
      else
        echo "Unknown argument: $1" >&2; exit 1
      fi ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  echo "Error: project directory required" >&2; exit 1
fi
if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Error: directory $PROJECT_DIR does not exist" >&2; exit 1
fi
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "Error: no package.json found in $PROJECT_DIR" >&2; exit 1
fi

cd "$PROJECT_DIR"
PROJECT_NAME=$(node -e "console.log(require('./package.json').name || '$(basename $PROJECT_DIR)')")

# --- Auto-detect backend ---
if [[ "$BACKEND" == "auto" ]]; then
  if grep -q '"@supabase/supabase-js"\|"@supabase/ssr"' package.json 2>/dev/null; then
    BACKEND="supabase"
  elif grep -q '"mongoose"\|"mongodb"' package.json 2>/dev/null; then
    BACKEND="mongodb"
  else
    BACKEND="none"
  fi
fi

# --- Auto-detect framework ---
if [[ "$FRAMEWORK" == "auto" ]]; then
  if grep -q '"next"' package.json 2>/dev/null; then
    FRAMEWORK="nextjs"
  elif grep -q '"vite"' package.json 2>/dev/null; then
    FRAMEWORK="vite"
  else
    FRAMEWORK="generic"
  fi
fi

# --- Detect package manager ---
PKG_MANAGER="npm"
if [[ -f "pnpm-lock.yaml" ]] || grep -q '"packageManager".*pnpm' package.json 2>/dev/null; then
  PKG_MANAGER="pnpm"
elif [[ -f "yarn.lock" ]]; then
  PKG_MANAGER="yarn"
fi

# --- Detect monorepo ---
IS_MONO=false
if [[ -f "turbo.json" ]] || [[ -f "pnpm-workspace.yaml" ]] || [[ -f "lerna.json" ]]; then
  IS_MONO=true
fi

# --- Package manager commands ---
case "$PKG_MANAGER" in
  pnpm)
    INSTALL_CMD="pnpm install --frozen-lockfile"
    RUN_CMD="pnpm run"
    ADD_DEV_CMD="pnpm add -wD"
    ;;
  yarn)
    INSTALL_CMD="yarn install --frozen-lockfile"
    RUN_CMD="yarn run"
    ADD_DEV_CMD="yarn add -D"
    ;;
  *)
    INSTALL_CMD="npm ci"
    RUN_CMD="npx"
    ADD_DEV_CMD="npm install --save-dev"
    ;;
esac

# --- Detect dev command for web server ---
if [[ "$IS_MONO" == "true" ]] && grep -q '"dev"' package.json; then
  DEV_CMD="$RUN_CMD dev"
elif [[ "$FRAMEWORK" == "nextjs" ]]; then
  DEV_CMD="$RUN_CMD dev"
elif [[ "$FRAMEWORK" == "vite" ]]; then
  DEV_CMD="$RUN_CMD dev"
else
  DEV_CMD="npm run dev"
fi

echo "🔧 Adding CI pipeline to $PROJECT_NAME"
echo "   Backend: $BACKEND | Framework: $FRAMEWORK | Pkg: $PKG_MANAGER | Tier: $TIER"
[[ "$IS_MONO" == "true" ]] && echo "   📦 Monorepo detected"

# --- Helpers ---
mkdir -p .github/workflows tests/smoke tests/e2e

check_overwrite() {
  local file="$1"
  if [[ -f "$file" && "$FORCE" != "true" ]]; then
    echo "   ⚠️  Skipping $file (exists, use --force to overwrite)"
    return 1
  fi
  return 0
}

# Helper: write pnpm action-setup step (must come BEFORE setup-node)
write_pnpm_setup() {
  local file="$1"
  if [[ "$PKG_MANAGER" == "pnpm" ]]; then
    printf '      - uses: pnpm/action-setup@v4\n' >> "$file"
  fi
}

# ============================================================
# CI WORKFLOW
# ============================================================
CI_FILE=".github/workflows/ci.yml"
if check_overwrite "$CI_FILE"; then
  {
    cat << 'HEADER'
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  NODE_VERSION: '24'

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
HEADER

    write_pnpm_setup "$CI_FILE"

    cat << EOF
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: '$PKG_MANAGER'
      - run: $INSTALL_CMD
      - run: $RUN_CMD typecheck
      - run: $RUN_CMD lint
EOF

    # Tier 2: Smoke tests
    if [[ "$TIER" -ge 2 ]]; then
      cat << 'SMOKE_HEADER'

  smoke-tests:
    name: Smoke Tests
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
SMOKE_HEADER

      write_pnpm_setup "$CI_FILE"

      cat << EOF
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: '$PKG_MANAGER'
      - run: $INSTALL_CMD
      - run: npx playwright install --with-deps
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-\${{ runner.os }}-\${{ hashFiles('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock') }}
          restore-keys: playwright-\${{ runner.os }}-
      - name: Start dev server
        run: $DEV_CMD &
      - name: Wait for server
        run: npx wait-on http://localhost:3000 --timeout 30000
EOF

      # Backend env vars for smoke tests
      if [[ "$BACKEND" == "supabase" ]]; then
        cat << 'EOF'
      - name: Run smoke tests
        run: npx playwright test --project=smoke
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
EOF
      elif [[ "$BACKEND" == "mongodb" ]]; then
        cat << 'EOF'
      - name: Run smoke tests
        run: npx playwright test --project=smoke
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
EOF
      else
        cat << 'EOF'
      - name: Run smoke tests
        run: npx playwright test --project=smoke
EOF
      fi

      cat << 'EOF'
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
EOF
    fi
  } > /dev/null  # Output goes to $CI_FILE via appends

  echo "   ✅ Created $CI_FILE"
fi

# ============================================================
# NIGHTLY E2E WORKFLOW (Tier 3)
# ============================================================
if [[ "$TIER" -ge 3 ]]; then
  E2E_FILE=".github/workflows/e2e-nightly.yml"
  if check_overwrite "$E2E_FILE"; then
    {
      cat << 'EOF'
name: E2E Nightly

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

env:
  NODE_VERSION: '24'

jobs:
  e2e-tests:
    name: Full E2E
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
EOF

      write_pnpm_setup "$E2E_FILE"

      cat << EOF
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: '$PKG_MANAGER'
      - run: $INSTALL_CMD
      - run: npx playwright install --with-deps
      - name: Run E2E tests
        run: npx playwright test --project=e2e
        env:
          E2E_USER_EMAIL: \${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: \${{ secrets.E2E_USER_PASSWORD }}
EOF

      if [[ "$BACKEND" == "supabase" ]]; then
        cat << 'EOF'
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
EOF
      elif [[ "$BACKEND" == "mongodb" ]]; then
        cat << 'EOF'
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
EOF
      fi

      cat << 'EOF'
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-report
          path: playwright-report/
          retention-days: 7
EOF
    } > /dev/null

    echo "   ✅ Created $E2E_FILE"
  fi
fi

# ============================================================
# PLAYWRIGHT CONFIG
# ============================================================
PW_CONFIG="playwright.config.ts"
if check_overwrite "$PW_CONFIG"; then
  cat > "$PW_CONFIG" << EOF
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testDir: './tests/smoke',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: '$DEV_CMD',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
EOF
  echo "   ✅ Created $PW_CONFIG"
fi

# ============================================================
# SMOKE TEST SPECS
# ============================================================
if [[ "$TIER" -ge 2 ]]; then
  if check_overwrite "tests/smoke/home.spec.ts"; then
    cat > "tests/smoke/home.spec.ts" << 'EOF'
import { test, expect } from '@playwright/test';

test('homepage loads without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/./);

  const realErrors = consoleErrors.filter(e =>
    !e.includes('ResizeObserver') &&
    !e.includes('Non-Error promise rejection')
  );
  expect(realErrors).toHaveLength(0);
});
EOF
    echo "   ✅ Created tests/smoke/home.spec.ts"
  fi

  if check_overwrite "tests/smoke/auth-redirect.spec.ts"; then
    cat > "tests/smoke/auth-redirect.spec.ts" << 'EOF'
import { test, expect } from '@playwright/test';

test('protected routes redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  // Adjust the URL pattern to match your auth redirect
  await expect(page).toHaveURL(/\/login|\/auth|\/sign-in/);
});
EOF
    echo "   ✅ Created tests/smoke/auth-redirect.spec.ts"
  fi
fi

# ============================================================
# E2E TEST SPECS
# ============================================================
if [[ "$TIER" -ge 3 ]]; then
  if check_overwrite "tests/e2e/auth.spec.ts"; then
    cat > "tests/e2e/auth.spec.ts" << 'EOF'
import { test, expect } from '@playwright/test';

test('sign in and access dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', process.env.E2E_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.E2E_USER_PASSWORD!);
  await page.click('[data-testid="submit"]');

  await expect(page).toHaveURL(/\/dashboard|\/home/);
});
EOF
    echo "   ✅ Created tests/e2e/auth.spec.ts"
  fi

  if check_overwrite "tests/e2e/crud.spec.ts"; then
    cat > "tests/e2e/crud.spec.ts" << 'EOF'
import { test, expect } from '@playwright/test';

test('create and delete an item', async ({ page }) => {
  await page.goto('/items/new');
  await page.fill('[data-testid="item-name"]', 'E2E Test Item');
  await page.click('[data-testid="save"]');
  await expect(page.locator('text=E2E Test Item')).toBeVisible();

  await page.click('[data-testid="delete"]');
  await page.click('[data-testid="confirm-delete"]');
  await expect(page.locator('text=E2E Test Item')).not.toBeVisible();
});
EOF
    echo "   ✅ Created tests/e2e/crud.spec.ts"
  fi
fi

# ============================================================
# .env.example
# ============================================================
if check_overwrite ".env.example"; then
  cat > ".env.example" << EOF
# CI Test Environment Variables
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_USER_EMAIL=test@example.com
E2E_USER_PASSWORD=changeme
EOF

  if [[ "$BACKEND" == "supabase" ]]; then
    cat >> ".env.example" << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
EOF
  elif [[ "$BACKEND" == "mongodb" ]]; then
    cat >> ".env.example" << 'EOF'
MONGODB_URI=mongodb://localhost:27017/test
EOF
  fi
  echo "   ✅ Created .env.example"
fi

# ============================================================
# INSTALL DEPENDENCIES
# ============================================================
if [[ "$SKIP_INSTALL" != "true" ]]; then
  echo "   📦 Installing Playwright + wait-on..."
  $ADD_DEV_CMD @playwright/test wait-on 2>&1 | tail -3
  npx playwright install chromium 2>&1 | tail -3
  echo "   ✅ Dependencies installed"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "✅ CI pipeline added to $PROJECT_NAME!"
echo ""
echo "Files created:"
echo "  .github/workflows/ci.yml          — Tier 1$([ $TIER -ge 2 ] && echo '+2') on PR"
[ $TIER -ge 3 ] && echo "  .github/workflows/e2e-nightly.yml  — Tier 3 nightly E2E"
echo "  playwright.config.ts              — Playwright configuration"
echo "  tests/smoke/                      — Smoke test specs"
[ $TIER -ge 3 ] && echo "  tests/e2e/                        — E2E test specs"
[[ "$PKG_MANAGER" != "npm" ]] && echo "  (Package manager: $PKG_MANAGER)"
[[ "$IS_MONO" == "true" ]] && echo "  (Monorepo: Turborepo workspace)"
echo ""
echo "Next steps:"
echo "  1. Set up GitHub Secrets (see .env.example)"
echo "  2. Commit and push to trigger first CI run"
echo "  3. Add data-testid attributes to your components"
if [[ "$SKIP_VERCEL" != "true" ]]; then
  echo "  4. Link Vercel project: vercel link"
fi