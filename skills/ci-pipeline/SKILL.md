---
name: ci-pipeline
description: Scaffold and manage CI/CD pipelines for web projects. Use when adding tests, linting, GitHub Actions, Playwright E2E, or deploy gates to any project. Handles Next.js, Vite, and generic Node.js projects with Vercel, Supabase, or MongoDB backends. Triggers on "add CI", "set up testing", "add Playwright tests", "create CI pipeline", "GitHub Actions workflow", "deploy gate", "automated testing".
---

# CI Pipeline Skill

Scaffold production CI/CD pipelines for web projects and generic Node packages. Tested templates, not theory.

## Quick Start

```bash
# Add CI to an existing project
scripts/add-ci.sh /path/to/project [options]

# Create a new project with CI pre-wired
scripts/new-project.sh /path/to/project [options]
```

## What Gets Added

### Tier 1 — Fast Gate (every PR, ~30s)
- ESLint (`next lint` or `eslint .`)
- TypeScript type-check (`tsc --noEmit`)
- Blocks merge on failure

### Tier 2 — Smoke Tests (every PR, ~2min)
- Playwright browser smoke: homepage loads, no console errors, auth redirects
- Runs against Vercel preview deployment
- Blocks merge on failure

### Tier 3 — E2E Flows (nightly or manual, ~10min)
- Full user journeys: login, CRUD, data flows
- Runs on schedule (`cron: '0 3 * * *'`) or manual trigger
- Reports to Slack/Discord on failure

### Deploy Gate
- Vercel production deploy blocked until Tier 1+2 pass
- Preview deploys always happen (for Tier 2 testing)

## File Structure Added

```
project/
├── .github/
│   └── workflows/
│       ├── ci.yml          # Tier 1+2 on PR
│       └── e2e-nightly.yml # Tier 3 on schedule
├── tests/
│   ├── playwright.config.ts
│   ├── smoke/              # Tier 2
│   │   ├── home.spec.ts
│   │   └── auth-redirect.spec.ts
│   └── e2e/                # Tier 3
│       ├── auth.spec.ts
│       ├── crud.spec.ts
│       └── smoke-helpers.ts
├── .env.example            # Template for test secrets
└── .vercel/                # Vercel project linking (if not present)
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--backend` | `auto` | `supabase`, `mongodb`, `none`, or `auto` (detects from deps) |
| `--framework` | `auto` | `nextjs`, `vite`, `generic`, or `auto` (detects from package.json) |
| `--tier` | `2` | Max tier to set up (1=lint+type, 2=+smoke, 3=+e2e) |
| `--skip-vercel` | false | Skip Vercel preview integration |
| `--skip-install` | false | Skip npm install (use if adding to monorepo) |
| `--dry-run` | false | Preview detected stack, planned files, and install commands without writing anything |
| `--json` | false | Emit a structured plan for agents/automation |

## Agent planning mode

Before writing files in an unfamiliar repository, prefer:

```bash
npx @builtbyecho/add-ci /path/to/project --dry-run --json
```

Read the JSON plan first. Check `detected`, `files`, `installs`, and `notes`; only rerun without `--dry-run` when the plan fits the target repo. Existing files are marked as `skip` unless `--force` is supplied.

## Backend-Specific Notes

### Supabase
- CI uses `supabase test db` for migration testing
- Test DB: spin up Supabase CLI local instance per CI run
- RLS tests: `supabase test` with anon/authenticated roles
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### MongoDB
- CI uses MongoDB Memory Server for test isolation
- Mongoose models tested with `jest` or `vitest`
- No Atlas CI integration (tests run against in-memory Mongo)
- Env vars: `MONGODB_URI` (auto-set by Memory Server in CI)

### Generic Node/package projects
- Use `--framework generic --backend none` for CLIs, SDKs, libraries, and small agent tools.
- Creates only `.github/workflows/ci.yml`; no Playwright config/tests, `.env.example`, or browser-test dependency installs.
- Runs existing package scripts: Tier 1 uses `typecheck`, `lint`, `build`; Tier 2 adds `test`; Tier 3 adds `npm pack --dry-run`.

### No Backend
- Skip database tests
- For web apps, run lint + typecheck + Playwright smoke
- For generic Node packages, run package script checks only

## How It Works

1. **Detect** project type (framework, backend, existing config)
2. **Validate** preconditions (git repo, package.json, Vercel link)
3. **Generate** workflow files and test specs from templates
4. **Install** Playwright + dependencies for web apps only; generic Node/package mode installs nothing
5. **Wire** Vercel preview → wait → test flow
6. **Report** what was added and what secrets need setting

## Vercel Preview Integration

The CI flow for Tier 2:

```
PR created → Vercel builds preview → CI waits for deploy URL →
Playwright runs against preview URL → pass/fail → merge gate
```

Implemented via `vercel wait` in CI or the Vercel GitHub integration's `vercel-deployed` check.

## Important Constraints

- **Never commit secrets** — all env vars in GitHub Secrets or Vercel env
- **Playwright browsers** — cached in CI via `actions/cache` for web app modes
- **Generic mode** — no browser files or dependencies; use when the target is not a web app
- **Monorepo support** — use `--filter` for turborepo workspaces
- **Skip if exists** — never overwrite existing workflow or config files without `--force`

## References

- **Playwright patterns**: See [references/playwright-patterns.md](references/playwright-patterns.md) for smoke and E2E test patterns
- **Workflow templates**: See [references/workflow-templates.md](references/workflow-templates.md) for full YAML templates
- **Troubleshooting**: See [references/troubleshooting.md](references/troubleshooting.md) for common issues
