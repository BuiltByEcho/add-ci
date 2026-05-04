#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { Backend, Framework, Options, Tier } from "./types.js";
import { promptForOptions } from "./prompts.js";
import { runAddCi } from "./runner.js";

const HELP = `
@builtbyecho/add-ci — Scaffold CI/CD pipelines for web projects

Usage:
  npx @builtbyecho/add-ci [path] [options]

Arguments:
  path                Project directory (default: current directory)

Options:
  --backend <type>    Backend: supabase, mongodb, none, auto (default: auto)
  --framework <type>  Framework: nextjs, vite, auto (default: auto)
  --tier <level>      CI tier: 1 (lint+type), 2 (+smoke), 3 (+e2e) (default: 2)
  --skip-vercel       Skip Vercel integration
  --skip-install      Skip dependency installation
  --dry-run           Print the planned files without writing or installing anything
  --force             Overwrite existing files
  -h, --help          Show this help message

Examples:
  npx @builtbyecho/add-ci                           # Interactive prompts
  npx @builtbyecho/add-ci ./my-app                  # Target specific project
  npx @builtbyecho/add-ci . --backend supabase      # Explicit backend
  npx @builtbyecho/add-ci . --framework nextjs --tier 3  # Full CI pipeline
`;

function main() {
  const { values, positionals } = parseArgs({
    options: {
      backend: { type: "string" },
      framework: { type: "string" },
      tier: { type: "string" },
      "skip-vercel": { type: "boolean" },
      "skip-install": { type: "boolean" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  const validBackends: Backend[] = ["supabase", "mongodb", "none", "auto"];
  const validFrameworks: Framework[] = ["nextjs", "vite", "generic", "auto"];
  const validTiers: Tier[] = [1, 2, 3];

  const partial: Partial<Options> = {
    path: positionals[0] || process.cwd(),
  };

  if (values.backend) {
    const b = values.backend as Backend;
    if (!validBackends.includes(b)) {
      console.error(`Error: --backend must be one of: ${validBackends.join(", ")}`);
      process.exit(1);
    }
    partial.backend = b;
  }

  if (values.framework) {
    const f = values.framework as Framework;
    if (!validFrameworks.includes(f)) {
      console.error(`Error: --framework must be one of: ${validFrameworks.join(", ")}`);
      process.exit(1);
    }
    partial.framework = f;
  }

  if (values.tier) {
    const t = parseInt(values.tier as string, 10) as Tier;
    if (!validTiers.includes(t)) {
      console.error(`Error: --tier must be one of: ${validTiers.join(", ")}`);
      process.exit(1);
    }
    partial.tier = t;
  }

  if (values["skip-vercel"]) partial.skipVercel = true;
  if (values["skip-install"]) partial.skipInstall = true;
  if (values["dry-run"]) partial.dryRun = true;
  if (values.force) partial.force = true;

  // If all required options are provided, run directly (no prompts)
  const hasAllRequired =
    partial.path &&
    partial.backend &&
    partial.framework &&
    partial.tier !== undefined;

  if (hasAllRequired) {
    runAddCi(partial as Options).catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  } else {
    // Interactive mode
    promptForOptions(partial)
      .then((opts) => runAddCi(opts))
      .catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
  }
}

main();