# @builtbyecho/add-ci

Scaffold CI/CD pipelines for web projects. Zero-config auto-detection, opinionated defaults, and production-tested templates — not theory.

```bash
npx @builtbyecho/add-ci
```

## What It Does

Adds GitHub Actions workflows + Playwright test templates to any web project:

- **Tier 1 — Fast Gate** (~30s, every PR): ESLint + TypeScript type-check
- **Tier 2 — Smoke Tests** (~2min, every PR): Playwright browser smoke tests
- **Tier 3 — E2E Flows** (~10min, nightly): Full user journeys on schedule

## Quick Start

```bash
# Interactive mode — prompts for everything
npx @builtbyecho/add-ci

# Target a specific project
npx @builtbyecho/add-ci ./my-app

# Full pipeline with explicit options
npx @builtbyecho/add-ci . --backend supabase --framework nextjs --tier 3

# Auto-detect everything, tier 2
npx @builtbyecho/add-ci . --tier 2
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--backend` | `auto` | `supabase`, `mongodb`, `none`, or `auto` (detects from deps) |
| `--framework` | `auto` | `nextjs`, `vite`, or `auto` (detects from package.json) |
| `--tier` | `2` | Max tier: `1` (lint+type), `2` (+smoke), `3` (+e2e) |
| `--skip-vercel` | off | Skip Vercel preview integration |
| `--skip-install` | off | Skip npm/pnpm install step |
| `--force` | off | Overwrite existing workflow/test files |

## Auto-Detection

When `--backend` or `--framework` is `auto` (the default), the CLI reads your `package.json`:

- **Next.js**: detected by `next` dependency
- **Vite**: detected by `vite` dependency
- **Supabase**: detected by `@supabase/supabase-js` or `@supabase/ssr`
- **MongoDB**: detected by `mongoose` or `mongodb`
- **Package manager**: pnpm/yarn/npm by lockfile or `packageManager` field
- **Monorepo**: detected by `turbo.json`, `pnpm-workspace.yaml`, or `lerna.json`

## What Gets Added

```
project/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Tier 1+2 on PR
│       └── e2e-nightly.yml     # Tier 3 nightly (if tier 3)
├── tests/
│   ├── smoke/                  # Tier 2 browser smoke tests
│   │   ├── home.spec.ts
│   │   └── auth-redirect.spec.ts
│   └── e2e/                    # Tier 3 full flow tests
│       ├── auth.spec.ts
│       └── crud.spec.ts
├── playwright.config.ts
└── .env.example
```

## Backend-Specific Env Vars

### Supabase
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### MongoDB
- `MONGODB_URI`

### E2E (any backend)
- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`

Set these as GitHub Secrets before your first CI run.

## Monorepo Support

Works with pnpm workspaces + Turborepo. The generated workflows use `--filter` flags and pnpm workspace commands automatically.

## Examples

```bash
# Add basic lint+type CI to a Vite project
npx @builtbyecho/add-ci . --framework vite --tier 1

# Full pipeline for Next.js + Supabase
npx @builtbyecho/add-ci . --backend supabase --tier 3

# Skip install (useful in CI or monorepos)
npx @builtbyecho/add-ci . --skip-install

# Overwrite existing workflow files
npx @builtbyecho/add-ci . --force
```

## License

MIT