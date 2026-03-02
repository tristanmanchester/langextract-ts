#!/usr/bin/env node

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

const fixtures = [
  {
    name: "deep-internal-import",
    filePath: path.join(ROOT, "scripts/fixtures/arch/deep-internal-import.ts"),
    lintPath: path.join(ROOT, "packages/langextract/src/__arch_fixture_deep_internal__.ts"),
    expectedRuleIds: ["no-restricted-imports", "importx/no-internal-modules"],
  },
  {
    name: "default-export",
    filePath: path.join(ROOT, "scripts/fixtures/arch/default-export.ts"),
    lintPath: path.join(ROOT, "packages/langextract/src/__arch_fixture_default_export__.ts"),
    expectedRuleIds: ["importx/no-default-export"],
  },
];

function parseEslintJson(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("[");
  if (start === -1) {
    return null;
  }

  const jsonText = trimmed.slice(start);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

const failures = [];

for (const fixture of fixtures) {
  const source = readFileSync(fixture.filePath, "utf8");
  writeFileSync(fixture.lintPath, source, "utf8");

  try {
    const result = spawnSync(
      "pnpm",
      ["exec", "eslint", "--no-ignore", "--format", "json", fixture.lintPath],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          LINT_PROFILE: "arch",
        },
        encoding: "utf8",
      },
    );

    if (result.status === 0) {
      failures.push(`${fixture.name}: expected lint failure but command exited 0`);
      continue;
    }

    const parsed = parseEslintJson(result.stdout);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      failures.push(`${fixture.name}: could not parse eslint JSON output`);
      continue;
    }

    const messages = parsed.flatMap((entry) => entry.messages ?? []);
    const ruleIds = new Set(messages.map((message) => message.ruleId).filter(Boolean));

    for (const expectedRuleId of fixture.expectedRuleIds) {
      if (!ruleIds.has(expectedRuleId)) {
        failures.push(
          `${fixture.name}: missing expected rule "${expectedRuleId}" (got: ${
            [...ruleIds].join(", ") || "none"
          })`,
        );
      }
    }
  } finally {
    rmSync(fixture.lintPath, { force: true });
  }
}

if (failures.length > 0) {
  console.error("Architecture fixture check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Architecture fixture check passed.");
