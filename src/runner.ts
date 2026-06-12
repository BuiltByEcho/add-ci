import { resolve, dirname } from "path";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from "fs";
import { execSync } from "child_process";
import type { AddCiPlan, Options, Detected, PlannedFile } from "./types.js";
import { detect, pkgCommands } from "./detect.js";
import {
  generateCiYml,
  generateE2eNightlyYml,
  generatePlaywrightConfig,
  generateSmokeHome,
  generateSmokeAuthRedirect,
  generateE2eAuth,
  generateE2eCrud,
  generateEnvExample,
} from "./generate.js";

function getDevCmd(detected: Detected): { cmd: string; port: number } {
  const cmds = pkgCommands(detected.pkgManager);

  if (detected.isMonorepo) {
    // Monorepo: try to find the web app package
    return { cmd: `${cmds.run} dev`, port: 3000 };
  }

  switch (detected.framework) {
    case "nextjs":
      return { cmd: `${cmds.run} dev`, port: 3000 };
    case "vite":
      return { cmd: `${cmds.run} dev`, port: 5173 };
    default:
      return { cmd: "npm run dev", port: 3000 };
  }
}

function buildFilePlan(projectDir: string, isGenericNode: boolean, tier: number, force: boolean): PlannedFile[] {
  const paths: Array<{ path: string; kind: PlannedFile["kind"] }> = [
    { path: ".github/workflows/ci.yml", kind: "workflow" },
  ];

  if (!isGenericNode) {
    paths.push(
      { path: "playwright.config.ts", kind: "config" },
      { path: ".env.example", kind: "env" }
    );
    if (tier >= 2) {
      paths.push(
        { path: "tests/smoke/home.spec.ts", kind: "test" },
        { path: "tests/smoke/auth-redirect.spec.ts", kind: "test" }
      );
    }
    if (tier >= 3) {
      paths.push(
        { path: ".github/workflows/e2e-nightly.yml", kind: "workflow" },
        { path: "tests/e2e/auth.spec.ts", kind: "test" },
        { path: "tests/e2e/crud.spec.ts", kind: "test" }
      );
    }
  }

  return paths.map((file) => {
    const exists = existsSync(resolve(projectDir, file.path));
    if (!exists) return { ...file, action: "create" };
    if (force) return { ...file, action: "overwrite", reason: "--force enabled" };
    return { ...file, action: "skip", reason: "file exists; use --force to overwrite" };
  });
}

function buildPlan(projectDir: string, detected: Detected, opts: Options): AddCiPlan {
  const { cmd: devCmd, port: devPort } = getDevCmd(detected);
  const isGenericNode = detected.framework === "generic";
  const installCommands = isGenericNode
    ? []
    : [
        `${pkgCommands(detected.pkgManager).addDev} @playwright/test wait-on`,
        "npx playwright install chromium",
      ];

  const notes = [
    isGenericNode
      ? "generic Node/package CI uses existing package scripts and installs no browser-test dependencies"
      : "web app CI adds Playwright smoke coverage and browser dependencies",
  ];
  if (detected.isMonorepo) notes.push("monorepo detected");

  const nextSteps = isGenericNode
    ? [
        "Commit and push to trigger the first CI run.",
        "Add missing lint/typecheck/test scripts if you want stricter checks.",
      ]
    : [
        "Set required GitHub Secrets before the first CI run.",
        "Commit and push to trigger the first CI run.",
        "Add data-testid attributes to flows covered by generated tests.",
      ];

  return {
    projectDir,
    projectName: detected.projectName,
    detected,
    tier: opts.tier,
    devServer: isGenericNode ? undefined : { command: devCmd, port: devPort },
    files: buildFilePlan(projectDir, isGenericNode, opts.tier, opts.force),
    installs: opts.skipInstall ? [] : installCommands,
    notes,
    nextSteps,
  };
}

function writeFileIfNotExists(
  filePath: string,
  content: string,
  force: boolean
): boolean {
  if (existsSync(filePath) && !force) {
    log(`   ⚠️  Skipping ${filePath} (exists, use --force to overwrite)`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return true;
}

export async function runAddCi(opts: Options): Promise<void> {
  const projectDir = resolve(opts.path);
  const log = (msg: string) => {
    if (!opts.json) console.log(msg);
  };

  if (!existsSync(projectDir)) {
    throw new Error(`Directory ${projectDir} does not exist`);
  }

  if (!existsSync(resolve(projectDir, "package.json"))) {
    throw new Error(`No package.json found in ${projectDir}`);
  }

  // Detect project configuration
  const detected = detect(projectDir, {
    framework: opts.framework,
    backend: opts.backend,
  });

  const { cmd: devCmd, port: devPort } = getDevCmd(detected);
  const plan = buildPlan(projectDir, detected, opts);

  log("");
  log(`🔧 Adding CI pipeline to ${detected.projectName}`);
  log(
    `   Backend: ${detected.backend} | Framework: ${detected.framework} | Pkg: ${detected.pkgManager} | Tier: ${opts.tier}`
  );
  if (detected.isMonorepo) log("   📦 Monorepo detected");
  log("");

  // Workflow context
  const ctx = {
    pkg: detected.pkgManager,
    backend: detected.backend,
    tier: opts.tier,
    isMonorepo: detected.isMonorepo,
    devCmd,
    devPort,
    framework: detected.framework,
    scripts: detected.scripts,
  };

  const isGenericNode = detected.framework === "generic";

  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({ mode: "dry-run", plan }, null, 2));
      return;
    }
    log(
      "   🧪 Dry run: no files will be written and dependencies will not be installed."
    );
    log("");
    log("Would create/update:");
    for (const file of plan.files) {
      const suffix = file.action === "skip" ? ` (${file.reason})` : "";
      log(`  ${file.path}${suffix}`);
    }
    log("");
    if (plan.installs.length) {
      log("Would install:");
      for (const command of plan.installs) log(`  ${command}`);
    } else {
      const reason = isGenericNode
        ? "generic Node/package CI uses existing package scripts"
        : "--skip-install enabled";
      log(`Would install: nothing (${reason}).`);
    }
    log("");
    log("Run again without --dry-run to apply these changes.");
    return;
  }

  // Create directories
  mkdirSync(resolve(projectDir, ".github/workflows"), { recursive: true });
  if (!isGenericNode) {
    mkdirSync(resolve(projectDir, "tests/smoke"), { recursive: true });
    mkdirSync(resolve(projectDir, "tests/e2e"), { recursive: true });
  }

  // Generate CI workflow
  const ciYml = generateCiYml(ctx);
  const ciPath = resolve(projectDir, ".github/workflows/ci.yml");
  if (writeFileIfNotExists(ciPath, ciYml, opts.force)) {
    log(`   ✅ Created .github/workflows/ci.yml`);
  }

  // Generate E2E nightly workflow (Tier 3)
  if (!isGenericNode && opts.tier >= 3) {
    const e2eYml = generateE2eNightlyYml(ctx);
    const e2ePath = resolve(projectDir, ".github/workflows/e2e-nightly.yml");
    if (writeFileIfNotExists(e2ePath, e2eYml, opts.force)) {
      log(`   ✅ Created .github/workflows/e2e-nightly.yml`);
    }
  }

  // Generate Playwright config
  if (!isGenericNode) {
    const pwConfig = generatePlaywrightConfig(devCmd, devPort);
    const pwPath = resolve(projectDir, "playwright.config.ts");
    if (writeFileIfNotExists(pwPath, pwConfig, opts.force)) {
      log(`   ✅ Created playwright.config.ts`);
    }
  }

  // Generate smoke test specs (Tier 2+)
  if (!isGenericNode && opts.tier >= 2) {
    const smokeHomePath = resolve(projectDir, "tests/smoke/home.spec.ts");
    if (writeFileIfNotExists(smokeHomePath, generateSmokeHome(), opts.force)) {
      log(`   ✅ Created tests/smoke/home.spec.ts`);
    }

    const authRedirectPath = resolve(
      projectDir,
      "tests/smoke/auth-redirect.spec.ts"
    );
    if (
      writeFileIfNotExists(
        authRedirectPath,
        generateSmokeAuthRedirect(),
        opts.force
      )
    ) {
      log(`   ✅ Created tests/smoke/auth-redirect.spec.ts`);
    }
  }

  // Generate E2E test specs (Tier 3)
  if (!isGenericNode && opts.tier >= 3) {
    const e2eAuthPath = resolve(projectDir, "tests/e2e/auth.spec.ts");
    if (writeFileIfNotExists(e2eAuthPath, generateE2eAuth(), opts.force)) {
      log(`   ✅ Created tests/e2e/auth.spec.ts`);
    }

    const e2eCrudPath = resolve(projectDir, "tests/e2e/crud.spec.ts");
    if (writeFileIfNotExists(e2eCrudPath, generateE2eCrud(), opts.force)) {
      log(`   ✅ Created tests/e2e/crud.spec.ts`);
    }
  }

  // Generate .env.example
  if (!isGenericNode) {
    const envExamplePath = resolve(projectDir, ".env.example");
    const envContent = generateEnvExample(detected.backend);
    if (writeFileIfNotExists(envExamplePath, envContent, opts.force)) {
      log(`   ✅ Created .env.example`);
    }
  }

  // Install dependencies
  if (!opts.skipInstall && !isGenericNode) {
    log("   📦 Installing Playwright + wait-on...");
    const cmds = pkgCommands(detected.pkgManager);
    try {
      execSync(`${cmds.addDev} @playwright/test wait-on`, {
        cwd: projectDir,
        stdio: "pipe",
      });
      execSync("npx playwright install chromium", {
        cwd: projectDir,
        stdio: "pipe",
      });
      log("   ✅ Dependencies installed");
    } catch (e) {
      log("   ⚠️  Dependency installation had issues — you may need to install manually:");
      log(`     ${cmds.addDev} @playwright/test wait-on`);
      log("     npx playwright install chromium");
    }
  }

  // Summary
  log("");
  log(`✅ CI pipeline added to ${detected.projectName}!`);
  log("");
  log("Files created:");
  if (isGenericNode) {
    log("  .github/workflows/ci.yml          — Node package checks on PR/push");
  } else {
    log(`  .github/workflows/ci.yml          — Tier 1${opts.tier >= 2 ? "+2" : ""} on PR`);
  }
  if (!isGenericNode && opts.tier >= 3) {
    log("  .github/workflows/e2e-nightly.yml  — Tier 3 nightly E2E");
  }
  if (!isGenericNode) {
    log("  playwright.config.ts              — Playwright configuration");
  }
  if (!isGenericNode && opts.tier >= 2) {
    log("  tests/smoke/                      — Smoke test specs");
  }
  if (!isGenericNode && opts.tier >= 3) {
    log("  tests/e2e/                        — E2E test specs");
  }
  if (detected.pkgManager !== "npm") {
    log(`  (Package manager: ${detected.pkgManager})`);
  }
  if (detected.isMonorepo) {
    log("  (Monorepo: workspace detected)");
  }
  log("");
  log("Next steps:");
  if (isGenericNode) {
    log("  1. Commit and push to trigger first CI run");
    log("  2. Add missing lint/typecheck/test scripts if you want stricter checks");
  } else {
    log("  1. Set up GitHub Secrets (see .env.example)");
    log("  2. Commit and push to trigger first CI run");
    log("  3. Add data-testid attributes to your components");
    if (!opts.skipVercel) {
      log("  4. Link Vercel project: vercel link");
    }
  }
  log("");

  if (opts.json) {
    console.log(JSON.stringify({ mode: "apply", plan }, null, 2));
  }
}
