import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import { boundaryElements, boundaryRules } from "./tooling/eslint-config/boundaries.mjs";
import { scriptSourceFiles, typedSourceFiles } from "./tooling/eslint-config/files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lintProfile = process.env.LINT_PROFILE ?? "fast";
const useArchRules = lintProfile === "arch";

const fastTypeRules = {
  "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true, ignoreIIFE: true }],
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/no-unnecessary-condition": ["error", { allowConstantLoopConditions: true }],
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "error",
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
      ignoreRestSiblings: true,
    },
  ],
  "importx/no-self-import": "error",
};

const archRules = {
  "boundaries/element-types": ["error", boundaryRules],
  "boundaries/no-private": "error",
  "importx/no-cycle": "error",
  "importx/no-internal-modules": [
    "error",
    {
      forbid: ["@langextract-ts/*/src/**"],
    },
  ],
};

const baseRestrictedImportsOptions = {
  patterns: [
    {
      group: ["@langextract-ts/*/src/internal/*", "@langextract-ts/*/src/internal/**"],
      message: "Import package internals only through package entrypoints.",
    },
    {
      group: ["packages/**"],
      message: "Import from package entrypoints, never from workspace paths.",
    },
  ],
};

export default defineConfig(
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "**/dist/**",
    "build/**",
    "**/build/**",
    "out/**",
    "**/out/**",
    "coverage/**",
    "**/coverage/**",
    "scripts/fixtures/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: scriptSourceFiles,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["eslint.config.mjs", "**/*.config.{js,cjs,mjs,ts,cts,mts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: typedSourceFiles,
    plugins: {
      boundaries,
      importx: importPlugin,
      "unused-imports": unusedImports,
    },
    settings: {
      "boundaries/elements": boundaryElements,
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...fastTypeRules,
      ...(useArchRules ? archRules : {}),
      "no-restricted-imports": ["error", baseRestrictedImportsOptions],
    },
  },
  ...(useArchRules
    ? [
        {
          files: [
            "packages/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
            "scripts/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
          ],
          plugins: {
            importx: importPlugin,
          },
          rules: {
            "importx/no-default-export": "error",
          },
        },
        {
          files: ["**/*.config.{js,cjs,mjs,ts,cts,mts}", "eslint.config.mjs"],
          plugins: {
            importx: importPlugin,
          },
          rules: {
            "importx/no-default-export": "off",
          },
        },
      ]
    : []),
);
