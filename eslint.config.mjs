import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone package with its own toolchain (typecheck + vitest run
    // inside smarts-automation/); linting it from the app root only adds
    // noise — including its untracked recon output.
    "smarts-automation/**",
    // Agent scratch worktrees — not app source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
