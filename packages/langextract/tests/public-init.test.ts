import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import * as api from "../src/index.js";
import * as errorsApi from "../src/errors.js";
import * as exceptionsApi from "../src/exceptions.js";
import * as extractApi from "../src/extract.js";
import * as extractionApi from "../src/extraction.js";
import * as factoryApi from "../src/factory.js";
import * as ioApi from "../src/io.js";
import * as progressApi from "../src/progress.js";
import * as providersApi from "../src/providers.js";
import * as typesApi from "../src/types.js";
import * as visualizationApi from "../src/visualization.js";

void test("package entrypoint exports the public API domains", () => {
  assert.equal(typeof api.extract, "function");
  assert.equal(typeof api.createProviderRegistry, "function");
  assert.equal(typeof api.resolveModel, "function");
  assert.equal(typeof api.fetchTextFromUrl, "function");
  assert.equal(typeof api.formatExtractionProgress, "function");
  assert.equal(typeof api.renderHighlightsHtml, "function");
  assert.equal(typeof api.visualize, "function");

  assert.equal(typeof api.getLangextractErrorCode, "function");
  assert.equal(typeof api.LANGEXTRACT_ERROR_CODES, "object");
  assert.equal(api.LANGEXTRACT_WARNING_CODES.AliasLifecycle, "alias_lifecycle");
});

void test("public subpath shims mirror root entrypoint exports", () => {
  assert.equal(extractApi.extract, api.extract);
  assert.equal(extractionApi.extract, api.extract);
  assert.equal(providersApi.resolveModel, api.resolveModel);
  assert.equal(factoryApi.resolveModel, api.resolveModel);
  assert.equal(ioApi.fetchTextFromUrl, api.fetchTextFromUrl);
  assert.equal(progressApi.formatExtractionProgress, api.formatExtractionProgress);
  assert.equal(visualizationApi.visualize, api.visualize);
  assert.equal(typesApi.LANGEXTRACT_WARNING_CODES, api.LANGEXTRACT_WARNING_CODES);
  assert.equal(errorsApi.LANGEXTRACT_ERROR_CODES, api.LANGEXTRACT_ERROR_CODES);
  assert.equal(exceptionsApi.LANGEXTRACT_ERROR_CODES, api.LANGEXTRACT_ERROR_CODES);
});

void test("package exports include legacy-compatible subpaths without internal leaks", () => {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };

  const exportsField = packageJson.exports ?? {};
  const required = [
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

  for (const key of required) {
    const entry = exportsField[key] as { import?: string; types?: string } | undefined;
    assert.ok(entry, `missing export key: ${key}`);
    assert.equal(typeof entry.import, "string");
    assert.equal(typeof entry.types, "string");
    assert.equal(entry.import.includes("src/internal/"), false);
    assert.equal(entry.types.includes("src/internal/"), false);
  }

  const extractionAlias = exportsField["./extraction"] as
    | { import?: string; types?: string }
    | undefined;
  const factoryAlias = exportsField["./factory"] as { import?: string; types?: string } | undefined;
  const exceptionsAlias = exportsField["./exceptions"] as
    | { import?: string; types?: string }
    | undefined;

  assert.ok(extractionAlias !== undefined);
  assert.ok(factoryAlias !== undefined);
  assert.ok(exceptionsAlias !== undefined);

  assert.equal(extractionAlias.import, "./dist/extraction.js");
  assert.equal(extractionAlias.types, "./dist/extraction.d.ts");
  assert.equal(factoryAlias.import, "./dist/factory.js");
  assert.equal(factoryAlias.types, "./dist/factory.d.ts");
  assert.equal(exceptionsAlias.import, "./dist/exceptions.js");
  assert.equal(exceptionsAlias.types, "./dist/exceptions.d.ts");
});
