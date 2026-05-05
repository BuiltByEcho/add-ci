import { resolve, dirname } from "path";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from "fs";
import { execSync } from "child_process";
import type { Options, Detected, Tier } from "./types.js";
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

function log(msg: string) {
  console.log(msg);
}

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
  const plannedFiles: string[] = [".github/workflows/ci.yml"];
  if (!isGenericNode) {
    plannedFiles.push("playwright.config.ts", ".env.example");
    if (opts.tier >= 2) {
      plannedFiles.push(
        "tests/smoke/home.spec.ts",
        "tests/smoke/auth-redirect.spec.ts"
      );
    }
    if (!isGenericNode && opts.tier >= 3) {
      plannedFiles.push(
        ".github/workflows/e2e-nightly.yml",
        "tests/e2e/auth.spec.ts",
        "tests/e2e/crud.spec.ts"
      );
    }
  }

  if (opts.dryRun) {
    log(
      "   🧪 Dry run: no files will be written and dependencies will not be installed."
    );
    log("");
    log("Would create/update:");
    for (const file of plannedFiles) log(`  ${file}`);
    log("");
    if (isGenericNode) {
      log("Would install: nothing (generic Node/package CI uses existing package scripts).");
    } else {
      log("Would install:");
      log(
        `  ${pkgCommands(detected.pkgManager).addDev} @playwright/test wait-on`
      );
      log("  npx playwright install chromium");
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
}
