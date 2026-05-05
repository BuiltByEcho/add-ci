import type { Backend, Detected, Framework, PkgManager } from "./types.js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
}

function readPackageJson(dir: string): PackageJson {
  const path = resolve(dir, "package.json");
  if (!existsSync(path)) {
    throw new Error(`No package.json found in ${dir}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function hasDep(pkg: PackageJson, names: string[]): boolean {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return names.some((n) => n in allDeps);
}

export function detectFramework(dir: string, hint: Framework): Framework {
  if (hint !== "auto") return hint;
  const pkg = readPackageJson(dir);
  if (hasDep(pkg, ["next"])) return "nextjs";
  if (hasDep(pkg, ["vite"])) return "vite";
  return "generic";
}

export function detectBackend(dir: string, hint: Backend): Backend {
  if (hint !== "auto") return hint;
  const pkg = readPackageJson(dir);
  if (hasDep(pkg, ["@supabase/supabase-js", "@supabase/ssr"])) return "supabase";
  if (hasDep(pkg, ["mongoose", "mongodb"])) return "mongodb";
  return "none";
}

export function detectPkgManager(dir: string): PkgManager {
  const pkg = readPackageJson(dir);
  if (
    existsSync(resolve(dir, "pnpm-lock.yaml")) ||
    pkg.packageManager?.includes("pnpm")
  ) {
    return "pnpm";
  }
  if (existsSync(resolve(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

export function detectMonorepo(dir: string): boolean {
  return (
    existsSync(resolve(dir, "turbo.json")) ||
    existsSync(resolve(dir, "pnpm-workspace.yaml")) ||
    existsSync(resolve(dir, "lerna.json"))
  );
}

export function getProjectName(dir: string): string {
  const pkg = readPackageJson(dir);
  return pkg.name || dir.split("/").pop() || "unknown";
}

export function detect(dir: string, opts: { framework: Framework; backend: Backend }): Detected {
  const pkg = readPackageJson(dir);
  return {
    framework: detectFramework(dir, opts.framework),
    backend: detectBackend(dir, opts.backend),
    pkgManager: detectPkgManager(dir),
    isMonorepo: detectMonorepo(dir),
    projectName: pkg.name || dir.split("/").pop() || "unknown",
    scripts: pkg.scripts || {},
  };
}

export function pkgCommands(pm: PkgManager) {
  switch (pm) {
    case "pnpm":
      return {
        install: "pnpm install --frozen-lockfile",
        run: "pnpm run",
        addDev: "pnpm add -wD",
        npx: "pnpm exec",
        filter: (pkg: string) => `pnpm --filter ${pkg}`,
      };
    case "yarn":
      return {
        install: "yarn install --frozen-lockfile",
        run: "yarn run",
        addDev: "yarn add -D",
        npx: "npx",
        filter: (pkg: string) => `yarn workspace ${pkg}`,
      };
    default:
      return {
        install: "npm ci",
        run: "npm run",
        addDev: "npm install --save-dev",
        npx: "npx",
        filter: (pkg: string) => `npm -w ${pkg}`,
      };
  }
}