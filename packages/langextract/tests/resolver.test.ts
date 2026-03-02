import assert from "node:assert/strict";
import { test } from "vitest";

import { FormatHandler, Resolver, WordAligner } from "../src/internal/resolver/index.js";

void test("FormatHandler parses fenced JSON payload", () => {
  const handler = new FormatHandler();
  const parsed = handler.parse(
    [
      "model preface",
      "```json",
      '{"extractions":[{"text":"Berlin","label":"location"}]}',
      "```",
    ].join("\n"),
  );

  assert.equal(parsed.format, "json");
  assert.equal(parsed.fromFence, true);
  assert.deepEqual(parsed.value, [{ text: "Berlin", label: "location" }]);
});

void test("FormatHandler parses YAML payload", () => {
  const handler = new FormatHandler({ formatType: "yaml" });
  const parsed = handler.parse(
    [
      "extractions:",
      "  - text: Alice",
      "    label: person",
      "  - text: Berlin",
      "    label: location",
    ].join("\n"),
  );

  assert.equal(parsed.format, "yaml");
  assert.deepEqual(parsed.value, [
    { text: "Alice", label: "person" },
    { text: "Berlin", label: "location" },
  ]);
});

void test("WordAligner returns exact, lesser, and fuzzy statuses", () => {
  const source = "Alice works at OpenAI in Berlin.";
  const aligner = new WordAligner({ fuzzyThreshold: 0.35 });

  const exact = aligner.align(source, "OpenAI");
  assert.equal(exact.status, "exact");

  const caseInsensitiveExact = aligner.align(source, "openai");
  assert.equal(caseInsensitiveExact.status, "exact");

  const lesser = aligner.align(source, "open-ai");
  assert.equal(lesser.status, "lesser");

  const fuzzy = aligner.align(source, "Alice workplace");
  assert.equal(fuzzy.status, "fuzzy");
  assert.ok(fuzzy.score >= 0.35);
});

void test("Resolver parses structured output and aligns entities", () => {
  const resolver = new Resolver();
  const sourceText = "Alice works at OpenAI in Berlin.";
  const modelOutput = JSON.stringify({
    extractions: [
      { text: "OpenAI", label: "organization" },
      { text: "berlin", label: "location" },
      { text: "Alyce works", label: "person" },
    ],
  });

  const resolved = resolver.resolve({ sourceText, modelOutput });

  assert.equal(resolved.length, 3);
  assert.equal(resolved[0]?.alignmentStatus, "exact");
  assert.equal(resolved[1]?.alignmentStatus, "exact");
  assert.equal(resolved[2]?.alignmentStatus, "fuzzy");
});
