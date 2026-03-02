#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const LIBRARY_PACKAGE_JSON_PATH = path.join(ROOT, "packages/langextract/package.json");
const LEGACY_ALIAS_SOURCE_SHIMS = [
  path.join(ROOT, "packages/langextract/src/extraction.ts"),
  path.join(ROOT, "packages/langextract/src/factory.ts"),
  path.join(ROOT, "packages/langextract/src/exceptions.ts"),
];
const RELEASE_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/release-package.yml");
const PR_OFFLINE_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/pr-offline-deterministic.yml");
const LIVE_SMOKE_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/live-smoke.yml");
const PARITY_MATRIX_PATH = path.join(ROOT, "docs/migration/parity-matrix.md");
const CONTRACT_DELTAS_PATH = path.join(ROOT, "docs/migration/contract-deltas.md");
const PARITY_FINAL_REPORT_PATH = path.join(ROOT, "docs/migration/parity-final-report.md");
const RELEASE_RUNBOOK_PATH = path.join(ROOT, "docs/release/runbook.md");
const AI_CHANGE_LOG_PATH = path.join(ROOT, "docs/AI_CHANGE_LOG.md");

const REQUIRED_ROOT_SCRIPTS = [
  "test:coverage:strict",
  "test:smoke:live",
  "check:release-governance",
  "release:check",
];
const REQUIRED_LIBRARY_EXPORTS = [
  ".",
  "./extract",
  "./providers",
  "./io",
  "./progress",
  "./visualization",
  "./types",
  "./errors",
  "./extraction",
  "./factory",
  "./exceptions",
];
const REQUIRED_LEGACY_ALIAS_EXPORT_PATHS = {
  "./extraction": {
    import: "./dist/extraction.js",
    types: "./dist/extraction.d.ts",
  },
  "./factory": {
    import: "./dist/factory.js",
    types: "./dist/factory.d.ts",
  },
  "./exceptions": {
    import: "./dist/exceptions.js",
    types: "./dist/exceptions.d.ts",
  },
};

const failures = [];

if (!existsSync(ROOT_PACKAGE_JSON_PATH)) {
  failures.push("missing root package.json");
} else {
  const rootPackageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8"));
  const rootScripts = rootPackageJson.scripts ?? {};
  for (const scriptName of REQUIRED_ROOT_SCRIPTS) {
    if (
      typeof rootScripts[scriptName] !== "string" ||
      rootScripts[scriptName].trim().length === 0
    ) {
      failures.push(`missing required root script: ${scriptName}`);
    }
  }
}

if (!existsSync(LIBRARY_PACKAGE_JSON_PATH)) {
  failures.push("missing library package.json at packages/langextract/package.json");
} else {
  const libraryPackageJson = JSON.parse(readFileSync(LIBRARY_PACKAGE_JSON_PATH, "utf8"));
  if (libraryPackageJson.private !== false) {
    failures.push(
      "library package must be publishable: packages/langextract/package.json private must be false",
    );
  }

  if (!Array.isArray(libraryPackageJson.files) || !libraryPackageJson.files.includes("dist")) {
    failures.push('library package must explicitly publish dist via files: ["dist"]');
  }

  const exportsField = libraryPackageJson.exports ?? {};
  for (const key of REQUIRED_LIBRARY_EXPORTS) {
    const entry = exportsField[key];
    if (entry === undefined) {
      failures.push(`library package exports missing required key: ${key}`);
      continue;
    }
    if (typeof entry !== "object" || entry === null) {
      failures.push(`library package export "${key}" must be an object with import/types`);
      continue;
    }
    if (typeof entry.import !== "string" || entry.import.trim().length === 0) {
      failures.push(`library package export "${key}" missing "import" path`);
    }
    if (typeof entry.types !== "string" || entry.types.trim().length === 0) {
      failures.push(`library package export "${key}" missing "types" path`);
    }
  }

  for (const [legacyKey, expectedPaths] of Object.entries(REQUIRED_LEGACY_ALIAS_EXPORT_PATHS)) {
    const entry = exportsField[legacyKey];
    if (typeof entry !== "object" || entry === null) {
      failures.push(`legacy alias export "${legacyKey}" must be an object with import/types`);
      continue;
    }
    if (entry.import !== expectedPaths.import) {
      failures.push(
        `legacy alias export "${legacyKey}" import path must be "${expectedPaths.import}"`,
      );
    }
    if (entry.types !== expectedPaths.types) {
      failures.push(
        `legacy alias export "${legacyKey}" types path must be "${expectedPaths.types}"`,
      );
    }
  }
}

for (const shimPath of LEGACY_ALIAS_SOURCE_SHIMS) {
  if (!existsSync(shimPath)) {
    failures.push(`missing legacy alias source shim: ${path.relative(ROOT, shimPath)}`);
  }
}

if (!existsSync(RELEASE_WORKFLOW_PATH)) {
  failures.push("missing release workflow: .github/workflows/release-package.yml");
} else {
  const workflowText = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
  const requiredSnippets = [
    "workflow_dispatch:",
    "id-token: write",
    "check:release-governance",
    "release:check",
    "--provenance",
    "registry-url: https://registry.npmjs.org",
  ];

  for (const snippet of requiredSnippets) {
    if (!workflowText.includes(snippet)) {
      failures.push(`release workflow missing required snippet: ${snippet}`);
    }
  }
}

if (!existsSync(PR_OFFLINE_WORKFLOW_PATH)) {
  failures.push(
    "missing PR deterministic workflow: .github/workflows/pr-offline-deterministic.yml",
  );
} else {
  const workflowText = readFileSync(PR_OFFLINE_WORKFLOW_PATH, "utf8");
  const requiredSnippets = [
    "pull_request:",
    "workflow_dispatch:",
    'LANGEXTRACT_LIVE_SMOKE: "0"',
    "pnpm run verify",
    "pnpm run test",
    "pnpm run test:coverage:strict",
  ];

  for (const snippet of requiredSnippets) {
    if (!workflowText.includes(snippet)) {
      failures.push(`PR deterministic workflow missing required snippet: ${snippet}`);
    }
  }
}

if (!existsSync(LIVE_SMOKE_WORKFLOW_PATH)) {
  failures.push("missing live-smoke workflow: .github/workflows/live-smoke.yml");
} else {
  const workflowText = readFileSync(LIVE_SMOKE_WORKFLOW_PATH, "utf8");
  const requiredSnippets = [
    "schedule:",
    "workflow_dispatch:",
    'LANGEXTRACT_LIVE_SMOKE: "1"',
    'LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS: "1"',
    "pnpm run test:smoke:live",
  ];

  for (const snippet of requiredSnippets) {
    if (!workflowText.includes(snippet)) {
      failures.push(`live-smoke workflow missing required snippet: ${snippet}`);
    }
  }

  if (workflowText.includes("pull_request:")) {
    failures.push("live-smoke workflow must not run on pull_request");
  }
}

if (!existsSync(PARITY_MATRIX_PATH)) {
  failures.push("missing docs/migration/parity-matrix.md");
} else {
  const parityMatrix = readFileSync(PARITY_MATRIX_PATH, "utf8");
  if (!parityMatrix.includes("test:coverage:strict")) {
    failures.push("parity matrix must mention test:coverage:strict in release checklist");
  }
  if (!parityMatrix.includes("test:smoke:live")) {
    failures.push("parity matrix must mention test:smoke:live in release checklist");
  }
}

if (!existsSync(CONTRACT_DELTAS_PATH)) {
  failures.push("missing docs/migration/contract-deltas.md");
} else {
  const contractDeltas = readFileSync(CONTRACT_DELTAS_PATH, "utf8");
  if (!contractDeltas.includes("test:coverage:strict")) {
    failures.push("contract deltas release checklist must mention test:coverage:strict");
  }
  if (!contractDeltas.includes("test:smoke:live")) {
    failures.push("contract deltas release checklist must mention test:smoke:live");
  }
}

if (!existsSync(PARITY_FINAL_REPORT_PATH)) {
  failures.push("missing docs/migration/parity-final-report.md");
} else {
  const parityFinalReport = readFileSync(PARITY_FINAL_REPORT_PATH, "utf8");
  const requiredSnippets = [
    "pnpm run check",
    "pnpm run test",
    "pnpm run verify",
    "pnpm run test:coverage:strict",
  ];

  for (const snippet of requiredSnippets) {
    if (!parityFinalReport.includes(snippet)) {
      failures.push(`parity final report missing required command evidence: ${snippet}`);
    }
  }
}

if (!existsSync(RELEASE_RUNBOOK_PATH)) {
  failures.push("missing docs/release/runbook.md");
} else {
  const runbook = readFileSync(RELEASE_RUNBOOK_PATH, "utf8");
  const requiredSnippets = [
    "pnpm run release:check",
    "release-package.yml",
    "test:smoke:live",
    "LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1",
  ];

  for (const snippet of requiredSnippets) {
    if (!runbook.includes(snippet)) {
      failures.push(`release runbook missing required snippet: ${snippet}`);
    }
  }

  if (runbook.includes("/Users/")) {
    failures.push("release runbook must not include machine-specific absolute /Users paths");
  }
}

if (!existsSync(AI_CHANGE_LOG_PATH)) {
  failures.push("missing docs/AI_CHANGE_LOG.md");
}

if (failures.length > 0) {
  console.error("Release governance check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Release governance check passed.");
