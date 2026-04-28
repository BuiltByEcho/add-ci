import type { Backend, Detected, PkgManager, Tier } from "./types.js";
import { pkgCommands } from "./detect.js";

interface WorkflowCtx {
  pkg: PkgManager;
  backend: Backend;
  tier: Tier;
  isMonorepo: boolean;
  devCmd: string;
  devPort: number;
}

function pnpmSetup(indent: string = "      "): string {
  return `${indent}- uses: pnpm/action-setup@v4\n`;
}

function nodeSetup(ctx: WorkflowCtx, indent: string = "      "): string {
  let steps = "";
  if (ctx.pkg === "pnpm") steps += pnpmSetup(indent);
  steps += `${indent}- uses: actions/setup-node@v4\n`;
  steps += `${indent}  with:\n`;
  steps += `${indent}    node-version: \${{ env.NODE_VERSION }}\n`;
  steps += `${indent}    cache: '${ctx.pkg}'\n`;
  return steps;
}

function installStep(ctx: WorkflowCtx, indent: string = "      "): string {
  const cmds = pkgCommands(ctx.pkg);
  return `${indent}- run: ${cmds.install}\n`;
}

export function generateCiYml(ctx: WorkflowCtx): string {
  const cmds = pkgCommands(ctx.pkg);
  const lines: string[] = [];

  lines.push("name: CI");
  lines.push("");
  lines.push("on:");
  lines.push("  pull_request:");
  lines.push("    branches: [main]");
  lines.push("  push:");
  lines.push("    branches: [main]");
  lines.push("");
  lines.push("env:");
  lines.push("  NODE_VERSION: '24'");
  lines.push("");
  lines.push("jobs:");
  lines.push("  lint-and-typecheck:");
  lines.push("    name: Lint & Type Check");
  lines.push("    runs-on: ubuntu-latest");
  lines.push("    steps:");
  lines.push("      - uses: actions/checkout@v4");

  // Node setup
  lines.push(...nodeSetup(ctx).trimEnd().split("\n"));
  lines.push(...installStep(ctx).trimEnd().split("\n"));
  lines.push(`      - run: ${cmds.run} typecheck`);
  lines.push(`      - run: ${cmds.run} lint`);

  // Tier 2: Smoke tests
  if (ctx.tier >= 2) {
    lines.push("");
    lines.push("  smoke-tests:");
    lines.push("    name: Smoke Tests");
    lines.push("    needs: lint-and-typecheck");
    lines.push("    runs-on: ubuntu-latest");
    lines.push("    steps:");
    lines.push("      - uses: actions/checkout@v4");
    lines.push(...nodeSetup(ctx).trimEnd().split("\n"));
    lines.push(...installStep(ctx).trimEnd().split("\n"));
    lines.push("      - run: npx playwright install --with-deps");
    lines.push("      - name: Cache Playwright browsers");
    lines.push("        uses: actions/cache@v4");
    lines.push("        with:");
    lines.push("          path: ~/.cache/ms-playwright");
    lines.push(
      "          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock') }}"
    );
    lines.push("          restore-keys: playwright-${{ runner.os }}-");
    lines.push("      - name: Start dev server");
    lines.push(`        run: ${ctx.devCmd} &`);
    lines.push("      - name: Wait for server");
    lines.push(
      `        run: npx wait-on http://localhost:${ctx.devPort} --timeout 60000`
    );

    // Backend env vars
    if (ctx.backend === "supabase") {
      lines.push("      - name: Run smoke tests");
      lines.push("        run: npx playwright test --project=smoke");
      lines.push("        env:");
      lines.push("          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
      lines.push("          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}");
    } else if (ctx.backend === "mongodb") {
      lines.push("      - name: Run smoke tests");
      lines.push("        run: npx playwright test --project=smoke");
      lines.push("        env:");
      lines.push("          MONGODB_URI: ${{ secrets.MONGODB_URI }}");
    } else {
      lines.push("      - name: Run smoke tests");
      lines.push("        run: npx playwright test --project=smoke");
    }

    lines.push("      - uses: actions/upload-artifact@v4");
    lines.push("        if: failure()");
    lines.push("        with:");
    lines.push("          name: playwright-report");
    lines.push("          path: playwright-report/");
    lines.push("          retention-days: 7");
  }

  return lines.join("\n") + "\n";
}

export function generateE2eNightlyYml(ctx: WorkflowCtx): string {
  const lines: string[] = [];

  lines.push("name: E2E Nightly");
  lines.push("");
  lines.push("on:");
  lines.push("  schedule:");
  lines.push("    - cron: '0 3 * * *'");
  lines.push("  workflow_dispatch:");
  lines.push("");
  lines.push("env:");
  lines.push("  NODE_VERSION: '24'");
  lines.push("");
  lines.push("jobs:");
  lines.push("  e2e-tests:");
  lines.push("    name: Full E2E");
  lines.push("    runs-on: ubuntu-latest");
  lines.push("    steps:");
  lines.push("      - uses: actions/checkout@v4");
  lines.push(...nodeSetup(ctx).trimEnd().split("\n"));
  lines.push(...installStep(ctx).trimEnd().split("\n"));
  lines.push("      - run: npx playwright install --with-deps");
  lines.push("      - name: Run E2E tests");
  lines.push("        run: npx playwright test --project=e2e");
  lines.push("        env:");
  lines.push("          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}");
  lines.push("          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}");

  if (ctx.backend === "supabase") {
    lines.push("          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
    lines.push("          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}");
  } else if (ctx.backend === "mongodb") {
    lines.push("          MONGODB_URI: ${{ secrets.MONGODB_URI }}");
  }

  lines.push("      - uses: actions/upload-artifact@v4");
  lines.push("        if: failure()");
  lines.push("        with:");
  lines.push("          name: e2e-report");
  lines.push("          path: playwright-report/");
  lines.push("          retention-days: 7");

  return lines.join("\n") + "\n";
}

export function generatePlaywrightConfig(devCmd: string, port: number): string {
  return `import { defineConfig, devices } from '@playwright/test';

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
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:${port}',
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
    command: '${devCmd}',
    url: 'http://localhost:${port}',
    reuseExistingServer: !process.env.CI,
  },
});
`;
}

export function generateSmokeHome(): string {
  return `import { test, expect } from '@playwright/test';

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
`;
}

export function generateSmokeAuthRedirect(): string {
  return `import { test, expect } from '@playwright/test';

test('protected routes redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  // Adjust the URL pattern to match your auth redirect
  await expect(page).toHaveURL(/\\/login|\\/auth|\\/sign-in/);
});
`;
}

export function generateE2eAuth(): string {
  return `import { test, expect } from '@playwright/test';

test('sign in and access dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', process.env.E2E_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.E2E_USER_PASSWORD!);
  await page.click('[data-testid="submit"]');

  await expect(page).toHaveURL(/\\/dashboard|\\/home/);
});
`;
}

export function generateE2eCrud(): string {
  return `import { test, expect } from '@playwright/test';

test('create and delete an item', async ({ page }) => {
  await page.goto('/items/new');
  await page.fill('[data-testid="item-name"]', 'E2E Test Item');
  await page.click('[data-testid="save"]');
  await expect(page.locator('text=E2E Test Item')).toBeVisible();

  await page.click('[data-testid="delete"]');
  await page.click('[data-testid="confirm-delete"]');
  await expect(page.locator('text=E2E Test Item')).not.toBeVisible();
});
`;
}

export function generateEnvExample(backend: Backend): string {
  let content = `# CI Test Environment Variables
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_USER_EMAIL=test@example.com
E2E_USER_PASSWORD=changeme
`;
  if (backend === "supabase") {
    content += `SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
`;
  } else if (backend === "mongodb") {
    content += `MONGODB_URI=mongodb://localhost:27017/test
`;
  }
  return content;
}