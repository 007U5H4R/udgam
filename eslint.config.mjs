import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".design/**",
    "evals/results/**",
    "backlog/**",
    "node_modules/**",
    ".e2e-data/**",
    "data/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".claude/**",
  ]),
  {
    // technical-plan §3.3 / TC-005: src/lib is framework-free so evals, scripts and tests can import it.
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["next", "react", "react-dom", "server-only"].map((name) => ({
            name,
            message: "src/lib must not import Next.js, React or server-only; put framework code in src/app or src/components.",
          })),
          patterns: [
            {
              group: ["next/*", "react/*", "react-dom/*"],
              message: "src/lib must not import Next.js or React; put framework code in src/app or src/components.",
            },
          ],
        },
      ],
    },
  },
  {
    // TSK-18.5: the tamper generator is test-only. The app never imports it; the certificate test mode
    // (src/lib/certificate/test-mode.ts, outside src/app) is the one app-side user.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/ledger/testing", "@/lib/ledger/testing/*", "**/lib/ledger/testing", "**/lib/ledger/testing/*"],
              message: "src/lib/ledger/testing is test-only; only src/lib/certificate/test-mode.ts may use it.",
            },
          ],
        },
      ],
    },
  },
  {
    // TC-073 / TSK-18.1: the clean-room proof checker imports nothing outside its folder except node: built-ins.
    files: ["evals/scorers/independent-verifier/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/|node:)",
              message: "The clean-room checker may import only relative files in its folder and node: built-ins.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["evals/scorers/independent-verifier/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/|node:|vitest$)",
              message: "Clean-room checker tests may import only relative files, node: built-ins and vitest.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
