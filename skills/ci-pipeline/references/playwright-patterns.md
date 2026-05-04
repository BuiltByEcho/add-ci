# Playwright Patterns for CI

## Smoke Test Patterns (Tier 2)

### Homepage Loads
```typescript
import { test, expect } from '@playwright/test';

test('homepage loads without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/./); // any title = page rendered

  expect(consoleErrors).toHaveLength(0);
});
```

### Auth Redirect
```typescript
test('protected routes redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login|\/auth/);
});
```

### API Health Check
```typescript
test('API health endpoint responds', async ({ request }) => {
  const resp = await request.get('/api/health');
  expect(resp.ok()).toBeTruthy();
});
```

### No Console Errors
```typescript
test('no console errors on key pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const pages = ['/', '/about', '/pricing'];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }

  // Filter known acceptable errors (e.g. browser extensions)
  const realErrors = errors.filter(e =>
    !e.includes('ResizeObserver') &&
    !e.includes('Non-Error promise rejection')
  );
  expect(realErrors).toHaveLength(0);
});
```

## E2E Test Patterns (Tier 3)

### Supabase Auth Flow
```typescript
import { test, expect } from '@playwright/test';

test('sign in and access dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', process.env.E2E_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.E2E_USER_PASSWORD!);
  await page.click('[data-testid="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
});
```

### CRUD Operations
```typescript
test('create, read, update, delete item', async ({ page }) => {
  // Create
  await page.goto('/items/new');
  await page.fill('[data-testid="item-name"]', 'Test Item E2E');
  await page.click('[data-testid="save"]');
  await expect(page.locator('text=Test Item E2E')).toBeVisible();

  // Read (on list page)
  await page.goto('/items');
  await expect(page.locator('text=Test Item E2E')).toBeVisible();

  // Update
  await page.click('text=Test Item E2E');
  await page.fill('[data-testid="item-name"]', 'Test Item Updated');
  await page.click('[data-testid="save"]');
  await expect(page.locator('text=Test Item Updated')).toBeVisible();

  // Delete
  await page.click('[data-testid="delete"]');
  await page.click('[data-testid="confirm-delete"]');
  await expect(page.locator('text=Test Item Updated')).not.toBeVisible();
});
```

### MongoDB In-Memory Test
```typescript
// For Tier 3 tests that need DB but not browser
import { test, expect } from '@playwright/test';
// Or use vitest for non-browser DB tests:
// tests/e2e/db-operations.spec.ts → run with vitest in CI

test('data persists across page reloads', async ({ page }) => {
  await page.goto('/items/new');
  await page.fill('[data-testid="item-name"]', 'Persist Test');
  await page.click('[data-testid="save"]');

  await page.reload();
  await expect(page.locator('text=Persist Test')).toBeVisible();
});
```

## Playwright Config Template

```typescript
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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Key Rules

- **Always use `data-testid`** for selectors — never class names or text content (fragile)
- **Parallel in CI** — `fullyParallel: true` saves time
- **Retries in CI** — 2 retries to handle flaky tests
- **Single worker in CI** — `workers: 1` avoids resource contention
- **Trace on failure** — debug CI failures with `trace: 'on-first-retry'`
- **GitHub reporter in CI** — annotations show inline on PRs