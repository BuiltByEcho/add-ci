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
  dryRun: boolean;
  json: boolean;
}

export interface PlannedFile {
  path: string;
  kind: "workflow" | "config" | "env" | "test";
  action: "create" | "overwrite" | "skip";
  reason?: string;
}

export interface AddCiPlan {
  projectDir: string;
  projectName: string;
  detected: Detected;
  tier: Tier;
  devServer?: {
    command: string;
    port: number;
  };
  files: PlannedFile[];
  installs: string[];
  notes: string[];
  nextSteps: string[];
}

export interface Detected {
  framework: Framework;
  backend: Backend;
  pkgManager: PkgManager;
  isMonorepo: boolean;
  projectName: string;
  scripts: Record<string, string>;
}
