#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, "packages");
const REQUIRED_HEADINGS = ["## Purpose", "## Public API", "## Import Rules"];

function collectInternalExportPaths(exportsField, result = []) {
  if (typeof exportsField === "string") {
    result.push(exportsField);
    return result;
  }

  if (Array.isArray(exportsField)) {
    for (const value of exportsField) {
      collectInternalExportPaths(value, result);
    }
    return result;
  }

  if (exportsField && typeof exportsField === "object") {
    for (const value of Object.values(exportsField)) {
      collectInternalExportPaths(value, result);
    }
  }

  return result;
}

if (!existsSync(PACKAGES_DIR)) {
  console.log("No packages directory found. Skipping package contract checks.");
  process.exit(0);
}

const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (packageDirs.length === 0) {
  console.log("No packages found. Skipping package contract checks.");
  process.exit(0);
}

const failures = [];

for (const packageName of packageDirs) {
  const packageRoot = path.join(PACKAGES_DIR, packageName);
  const readmePath = path.join(packageRoot, "README.md");
  const packageJsonPath = path.join(packageRoot, "package.json");

  if (!existsSync(readmePath)) {
    failures.push(`${packageName}: missing README.md`);
  } else {
    const readme = readFileSync(readmePath, "utf8");
    for (const heading of REQUIRED_HEADINGS) {
      if (!readme.includes(heading)) {
        failures.push(`${packageName}: README.md missing heading "${heading}"`);
      }
    }
  }

  if (!existsSync(packageJsonPath)) {
    failures.push(`${packageName}: missing package.json`);
    continue;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const exportPaths = collectInternalExportPaths(packageJson.exports);
  const internalLeaks = exportPaths.filter(
    (entry) => typeof entry === "string" && entry.includes("src/internal/"),
  );

  if (internalLeaks.length > 0) {
    failures.push(
      `${packageName}: package.json exports expose internal paths: ${internalLeaks.join(", ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Package contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Package contract check passed.");
