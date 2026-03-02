import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "scripts", "packages"].filter((dir) =>
  existsSync(path.join(ROOT, dir)),
);

function isCodeFile(relativePath) {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(relativePath);
}

function shouldSkip(relativePath) {
  return (
    relativePath.startsWith("node_modules/") ||
    relativePath.includes("/node_modules/") ||
    relativePath.startsWith(".git/") ||
    relativePath.startsWith("dist/") ||
    relativePath.startsWith("build/") ||
    relativePath.startsWith("out/") ||
    relativePath.startsWith("coverage/") ||
    relativePath.startsWith("scripts/fixtures/")
  );
}

function walk(relativeDir, acc) {
  const absDir = path.join(ROOT, relativeDir);
  for (const entry of readdirSync(absDir)) {
    const relPath = path.posix.join(relativeDir, entry);
    const absPath = path.join(ROOT, relPath);
    if (shouldSkip(relPath)) {
      continue;
    }
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      walk(relPath, acc);
      continue;
    }
    if (isCodeFile(relPath)) {
      acc.push(relPath);
    }
  }
}

function collectImportSpecifiers(code) {
  const matches = [];
  const fromPattern = /\bfrom\s+["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  let fromMatch = fromPattern.exec(code);
  while (fromMatch) {
    matches.push(fromMatch[1]);
    fromMatch = fromPattern.exec(code);
  }

  let dynamicMatch = dynamicPattern.exec(code);
  while (dynamicMatch) {
    matches.push(dynamicMatch[1]);
    dynamicMatch = dynamicPattern.exec(code);
  }

  return matches;
}

function packageNameFromPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("packages/")) {
    return null;
  }
  const parts = normalized.split("/");
  return parts.length > 1 ? parts[1] : null;
}

if (SOURCE_ROOTS.length === 0) {
  console.log("No source roots found for architecture import checks. Skipping.");
  process.exit(0);
}

const files = [];
for (const root of SOURCE_ROOTS) {
  walk(root, files);
}

if (files.length === 0) {
  console.log("No code files found for architecture import checks. Skipping.");
  process.exit(0);
}

const violations = [];

for (const file of files) {
  const absFilePath = path.join(ROOT, file);
  const sourcePackage = packageNameFromPath(file);
  const code = readFileSync(absFilePath, "utf8");
  const imports = collectImportSpecifiers(code);

  for (const specifier of imports) {
    if (specifier.startsWith("@langextract-ts/") && specifier.includes("/src/")) {
      violations.push(`${file}: cannot import package source paths via "${specifier}"`);
    }

    if (specifier.startsWith("@langextract-ts/") && specifier.includes("/src/internal/")) {
      violations.push(`${file}: cannot import package internals via "${specifier}"`);
    }

    if (specifier.startsWith("packages/")) {
      violations.push(`${file}: cannot import from workspace paths via "${specifier}"`);
    }

    if (sourcePackage && specifier.startsWith(".")) {
      const resolvedPath = path.resolve(path.dirname(absFilePath), specifier);
      const resolvedRelative = path.relative(ROOT, resolvedPath).replace(/\\/g, "/");

      if (resolvedRelative.startsWith("packages/")) {
        const targetPackage = packageNameFromPath(resolvedRelative);
        if (targetPackage && targetPackage !== sourcePackage) {
          violations.push(
            `${file}: cannot use relative import across package boundaries via "${specifier}"`,
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture import check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Architecture import check passed.");
