import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createExtractionPostfix,
  createDownloadProgressBar,
  createExtractionProgressBar,
  createLoadProgressBar,
  createSaveProgressBar,
  formatExtractionProgress,
  formatExtractionStats,
  getModelInfo,
} from "../src/public/progress.js";

void test("createDownloadProgressBar includes total and downloading descriptor", () => {
  const descriptor = createDownloadProgressBar(1024, "https://example.com/file.txt");
  assert.equal(descriptor.total, 1024);
  assert.equal(typeof descriptor.description, "string");
  assert.equal(descriptor.description.includes("Downloading"), true);
});

void test("createExtractionProgressBar includes LangExtract and model id", () => {
  const descriptor = createExtractionProgressBar([1, 2, 3], "gemini-2.0-flash");
  assert.equal(typeof descriptor.description, "string");
  assert.equal(descriptor.description.includes("LangExtract"), true);
  assert.equal(descriptor.description.includes("gemini-2.0-flash"), true);
});

void test("createSaveProgressBar and createLoadProgressBar include save/load labels", () => {
  const save = createSaveProgressBar("/tmp/output.jsonl");
  const load = createLoadProgressBar("/tmp/output.jsonl");

  assert.equal(save.description.includes("Saving"), true);
  assert.equal(load.description.includes("Loading"), true);
});

void test("getModelInfo resolves modelId first, then modelUrl", () => {
  assert.equal(getModelInfo({ modelId: "gemini-1.5-pro" }), "gemini-1.5-pro");
  assert.equal(getModelInfo({ modelUrl: "https://example.model" }), "https://example.model");
  assert.equal(getModelInfo({}), undefined);
});

void test("format helpers keep grouped numbers and processing fallback", () => {
  const stats = formatExtractionStats(1500, 5000);
  assert.equal(stats.includes("1,500"), true);
  assert.equal(stats.includes("5,000"), true);

  const withModel = formatExtractionProgress("gemini-2.0-flash");
  assert.equal(withModel.includes("LangExtract"), true);
  assert.equal(withModel.includes("gemini-2.0-flash"), true);

  const withoutModel = formatExtractionProgress(undefined);
  assert.equal(withoutModel.includes("Processing"), true);
});

void test("createExtractionPostfix mirrors extraction stats formatter", () => {
  const postfix = createExtractionPostfix(1234, 5678);
  const stats = formatExtractionStats(1234, 5678);

  assert.equal(postfix, stats);
});
