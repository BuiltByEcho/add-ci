# @builtbyecho/add-ci

Scaffold CI/CD pipelines for web and Node package projects. Zero-config auto-detection, opinionated defaults, and production-tested templates — not theory.

```bash
npx @builtbyecho/add-ci
```

## What It Does

Adds GitHub Actions workflows to web apps and Node packages. For Next.js/Vite web apps it can add Playwright test templates; for generic Node packages it uses your existing package scripts without dragging in browser-test dependencies:

- **Tier 1 — Fast Gate** (~30s, every PR): ESLint + TypeScript type-check
- **Tier 2 — Smoke Tests** (~2min, every PR): Playwright browser smoke tests
- **Tier 3 — E2E Flows / Pack Smoke**: Full web user journeys on schedule, or `npm pack --dry-run` for Node packages

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

# Preview without touching the project
npx @builtbyecho/add-ci . --tier 2 --dry-run

# Node/CLI/package project: workflow only, no Playwright files or installs
npx @builtbyecho/add-ci . --framework generic --backend none --tier 3
```

## Dry Run Mode

Use `--dry-run` before letting an agent modify a repository. It performs the same package/framework/backend detection as a real run, then prints:

- the files that would be created or overwritten
- the Playwright/wait-on install command for web apps, or “nothing” for generic Node packages
- the reminder to rerun without `--dry-run` when the plan looks right

No directories are created, no files are written, and no dependencies are installed. This makes `add-ci` safer to use inside coding-agent handoffs and CI-planning conversations.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--backend` | `auto` | `supabase`, `mongodb`, `none`, or `auto` (detects from deps) |
| `--framework` | `auto` | `nextjs`, `vite`, `generic`, or `auto` (detects from package.json) |
| `--tier` | `2` | Max tier: `1` (lint+type), `2` (+smoke), `3` (+e2e) |
| `--skip-vercel` | off | Skip Vercel preview integration |
| `--skip-install` | off | Skip npm/pnpm install step |
| `--dry-run` | off | Preview detected stack, planned files, and install commands without writing anything |
| `--force` | off | Overwrite existing workflow/test files |

## Auto-Detection

When `--backend` or `--framework` is `auto` (the default), the CLI reads your `package.json`:

- **Next.js**: detected by `next` dependency
- **Vite**: detected by `vite` dependency
- **Supabase**: detected by `@supabase/supabase-js` or `@supabase/ssr`
- **MongoDB**: detected by `mongoose` or `mongodb`
- **Generic Node package**: default when no Next.js/Vite dependency is found
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


### Generic Node/package projects

When `--framework generic` is selected (or auto-detected because no Next.js/Vite dependency exists), `add-ci` creates only `.github/workflows/ci.yml`. It does **not** create Playwright config/tests, `.env.example`, or install browser-test dependencies. The workflow runs scripts that already exist in `package.json`:

- Tier 1: `typecheck`, `lint`, `build` when present
- Tier 2: adds `test` when present
- Tier 3: adds `npm pack --dry-run` as a package publish smoke test

This is meant for CLIs, SDKs, libraries, and small agent tools.

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

# Add package CI to a Node CLI/library without Playwright
npx @builtbyecho/add-ci . --framework generic --backend none --tier 3

# Full pipeline for Next.js + Supabase
npx @builtbyecho/add-ci . --backend supabase --tier 3

# Skip install (useful in CI or monorepos)
npx @builtbyecho/add-ci . --skip-install

# Overwrite existing workflow files
npx @builtbyecho/add-ci . --force
```

## Feedback & Issues

Found a bug? Have a feature request?

- **[Open an issue](https://github.com/BuiltByEcho/add-ci/issues/new)** — bug reports, feature requests, questions
- **[Discussions](https://github.com/BuiltByEcho/add-ci/discussions)** — ideas, Q&A, show & tell
- **[Discord](https://discord.com/invite/clawd)** — community chat

## License

MIT

## Agent Skill

This package includes an OpenClaw/Claude-style skill at `skills/ci-pipeline` that teaches agents to inspect, plan, and scaffold CI safely. Prefer `--dry-run` before writing files.
