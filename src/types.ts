export type Backend = "supabase" | "mongodb" | "none" | "auto";
export type Framework = "nextjs" | "vite" | "generic" | "auto";
export type PkgManager = "npm" | "pnpm" | "yarn";
export type Tier = 1 | 2 | 3;

export interface Options {
  path: string;
  backend: Backend;
  framework: Framework;
  tier: Tier;
  skipVercel: boolean;
  skipInstall: boolean;
  force: boolean;
}

export interface Detected {
  framework: Framework;
  backend: Backend;
  pkgManager: PkgManager;
  isMonorepo: boolean;
  projectName: string;
}