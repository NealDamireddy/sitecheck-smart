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
  {
    // Playwright fixtures take a callback named `use`; the React hooks
    // rule sees the name and misfires. These files never touch React.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // Test helpers and the logger intentionally discard destructured
    // fields; the leading underscore is the signal.
    files: ["src/lib/logger.ts", "tests/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
