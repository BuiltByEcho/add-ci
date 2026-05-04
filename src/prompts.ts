import prompts from "prompts";
import type { Backend, Framework, Options, Tier } from "./types.js";

export async function promptForOptions(partial: Partial<Options>): Promise<Options> {
  const questions: prompts.PromptArray = [];

  if (!partial.path) {
    questions.push({
      type: "text",
      name: "path",
      message: "Project directory path",
      initial: process.cwd(),
    });
  }

  if (!partial.framework || partial.framework === "auto") {
    questions.push({
      type: "select",
      name: "framework",
      message: "Framework",
      choices: [
        { title: "Auto-detect", value: "auto" },
        { title: "Next.js", value: "nextjs" },
        { title: "Vite", value: "vite" },
        { title: "Generic Node.js", value: "generic" },
      ],
      initial: 0,
    });
  }

  if (!partial.backend || partial.backend === "auto") {
    questions.push({
      type: "select",
      name: "backend",
      message: "Backend",
      choices: [
        { title: "Auto-detect", value: "auto" },
        { title: "Supabase", value: "supabase" },
        { title: "MongoDB", value: "mongodb" },
        { title: "None", value: "none" },
      ],
      initial: 0,
    });
  }

  if (!partial.tier) {
    questions.push({
      type: "select",
      name: "tier",
      message: "CI tier (higher = more testing)",
      choices: [
        { title: "Tier 1 — Lint + TypeCheck (~30s)", value: 1 },
        { title: "Tier 2 — + Smoke Tests (~2min)", value: 2 },
        { title: "Tier 3 — + Nightly E2E (~10min)", value: 3 },
      ],
      initial: 1,
    });
  }

  if (partial.skipVercel === undefined) {
    questions.push({
      type: "toggle",
      name: "skipVercel",
      message: "Skip Vercel integration?",
      initial: false,
      active: "yes",
      inactive: "no",
    });
  }

  if (partial.skipInstall === undefined) {
    questions.push({
      type: "toggle",
      name: "skipInstall",
      message: "Skip dependency install?",
      initial: false,
      active: "yes",
      inactive: "no",
    });
  }

  if (questions.length === 0) {
    return partial as Options;
  }

  const responses = await prompts(questions, {
    onCancel: () => {
      console.log("\nCancelled.");
      process.exit(1);
    },
  });

  return {
    path: partial.path || responses.path || process.cwd(),
    framework: partial.framework !== "auto" && partial.framework
      ? partial.framework
      : (responses.framework as Framework) || "auto",
    backend: partial.backend !== "auto" && partial.backend
      ? partial.backend
      : (responses.backend as Backend) || "auto",
    tier: partial.tier || (responses.tier as Tier) || 2,
    skipVercel: partial.skipVercel ?? responses.skipVercel ?? false,
    skipInstall: partial.skipInstall ?? responses.skipInstall ?? false,
    force: partial.force ?? false,
    dryRun: partial.dryRun ?? false,
  };
}
