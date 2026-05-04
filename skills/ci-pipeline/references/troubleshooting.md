# Troubleshooting

## Common Issues

### Playwright browsers fail to install in CI
**Symptom:** `npx playwright install` fails with dependency errors
**Fix:** Use `npx playwright install --with-deps` (installs system dependencies)
**Cache:** Cache `~/.cache/ms-playwright` between runs

### Vercel preview URL not available
**Symptom:** `vercel wait` times out or `VERCEL_PREVIEW_URL` is empty
**Fix:** 
1. Ensure Vercel GitHub integration is installed on the repo
2. Or set `VERCEL_TOKEN` secret and add Vercel project link with `vercel link`
3. Fallback: test against local dev server instead

### TypeScript check fails but project builds fine
**Symptom:** `tsc --noEmit` fails but `next build` succeeds
**Fix:** Next.js is lenient with types by default. Run `tsc --noEmit` locally first to fix errors, then CI will pass.

### Flaky tests in CI
**Symptom:** Tests pass locally but fail intermittently in CI
**Fix:**
1. Add `retries: 2` in CI (`process.env.CI ? 2 : 0`)
2. Use `workers: 1` in CI to avoid resource contention
3. Add `await page.waitForLoadState('networkidle')` before assertions
4. Use `data-testid` selectors instead of text content

### Supabase RLS tests fail
**Symptom:** Tests return 403 or empty results
**Fix:** 
1. Use `service_role` key for setup (bypasses RLS)
2. Use `anon` key for testing RLS policies
3. Clear test data between tests with `service_role` key

### MongoDB Memory Server won't start
**Symptom:** Timeout downloading MongoDB binary
**Fix:**
1. Cache the binary: `MONGOMS_SYSTEM_BINARY = /path/to/cache`
2. Or use `mongodb-memory-server-core` with a pinned version
3. Increase timeout: `MONGOMS_DOWNLOAD_URL` with a mirror

### GitHub Actions cache miss
**Symptom:** Every run reinstalls node_modules
**Fix:** Ensure `package-lock.json` is committed. The `cache: 'npm'` key depends on the lockfile hash.

### E2E tests can't find test user
**Symptom:** Auth login fails with invalid credentials
**Fix:**
1. Create a dedicated test user in your auth system
2. Store credentials in GitHub Secrets
3. Reset test user state before/after each test run