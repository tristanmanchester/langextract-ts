import assert from "node:assert/strict";
import { test } from "vitest";

import { FormatHandler, Resolver, WordAligner } from "../src/internal/resolver/index.js";

void test("WordAligner returns exact when hint span matches excerpt exactly", () => {
  const aligner = new WordAligner();
  const alignment = aligner.align("Hello Alice", "Alice", {
    hintStart: 6,
    hintEnd: 11,
  });

  assert.equal(alignment.status, "exact");
  assert.equal(alignment.start, 6);
  assert.equal(alignment.end, 11);
});

void test("WordAligner returns exact when hint span matches case-insensitively", () => {
  const aligner = new WordAligner();
  const alignment = aligner.align("OpenAI", "openai", {
    hintStart: 0,
    hintEnd: 6,
  });

  assert.equal(alignment.status, "exact");
  assert.equal(alignment.start, 0);
  assert.equal(alignment.end, 6);
});

void test("WordAligner can return fuzzy from hint span overlap", () => {
  const aligner = new WordAligner({ fuzzyThreshold: 0.9 });
  const alignment = aligner.align("Alice works in Berlin", "Alice work", {
    hintStart: 0,
    hintEnd: 11,
    acceptMatchLesser: false,
    fuzzyAlignmentThreshold: 0.5,
  });

  assert.equal(alignment.status, "fuzzy");
  assert.ok(alignment.score >= 0.5);
});

void test("WordAligner ignores invalid hints and falls back to global matching", () => {
  const aligner = new WordAligner();
  const alignment = aligner.align("Alice in Berlin", "Berlin", {
    hintStart: -3,
    hintEnd: 2,
  });

  assert.equal(alignment.status, "exact");
  assert.equal(alignment.text, "Berlin");
});

void test("Resolver derives candidate text from explicit start/end and parses confidence", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  const sourceText = "Visit Berlin now";
  const resolved = resolver.resolve({
    sourceText,
    modelOutput: JSON.stringify({
      extractions: [
        {
          span: "",
          category: "city",
          start: "6",
          end: "12",
          confidence: "0.8",
        },
      ],
    }),
  });

  assert.equal(resolved.length, 1);
  const first = resolved[0];
  assert.ok(first !== undefined);
  assert.equal(first.text, "Berlin");
  assert.equal(first.label, "city");
  assert.equal(first.confidence, 0.8);
});

void test("Resolver drops candidates with empty normalized text", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  const resolved = resolver.resolve({
    sourceText: "Alice",
    modelOutput: JSON.stringify({
      extractions: [{ text: "   ", label: "person" }],
    }),
  });

  assert.deepEqual(resolved, []);
});

void test("Resolver class-based parsing keeps ordering and attributes", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
    extractionIndexSuffix: "_idx",
  });

  const resolved = resolver.resolve({
    sourceText: "Alice Bob",
    modelOutput: JSON.stringify([
      { person: "Bob", person_idx: 2, person_attributes: { role: "dev" } },
      { person: "Alice", person_idx: 1 },
    ]),
  });

  assert.equal(resolved.length, 2);
  const first = resolved[0];
  const second = resolved[1];
  assert.ok(first !== undefined);
  assert.ok(second !== undefined);
  assert.equal(first.text, "Alice");
  assert.equal(second.text, "Bob");
  assert.deepEqual((second.raw as Record<string, unknown>).attributes, { role: "dev" });
});

void test("Resolver keeps exact case-insensitive matches even when acceptMatchLesser=false", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  const resolved = resolver.resolve({
    sourceText: "OpenAI",
    modelOutput: JSON.stringify({
      extractions: [{ text: "openai", label: "organization" }],
    }),
    acceptMatchLesser: false,
  });

  const first = resolved[0];
  assert.ok(first !== undefined);
  assert.equal(first.alignmentStatus, "exact");
  assert.equal(first.start, 0);
});

void test("WordAligner returns lesser for punctuation-separated variants", () => {
  const aligner = new WordAligner();
  const alignment = aligner.align("Patients with Type 2 diabetes.", "type-2 diabetes", {
    acceptMatchLesser: true,
    enableFuzzyAlignment: false,
  });

  assert.equal(alignment.status, "lesser");
  assert.equal(alignment.text, "Type 2 diabetes");
});

void test("Resolver disables fuzzy search when enableFuzzyAlignment=false", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  const resolved = resolver.resolve({
    sourceText: "Alice",
    modelOutput: JSON.stringify({
      extractions: [{ text: "Alyce", label: "person" }],
    }),
    acceptMatchLesser: false,
    enableFuzzyAlignment: false,
  });

  assert.equal(resolved.length, 1);
  const first = resolved[0];
  assert.ok(first !== undefined);
  assert.equal(first.alignmentStatus, "fuzzy");
  assert.equal(first.start, -1);
  assert.equal(first.end, -1);
});

void test("Resolver rejects out-of-range runtime fuzzy alignment threshold overrides", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  assert.throws(
    () =>
      resolver.resolve({
        sourceText: "OpenAI",
        modelOutput: JSON.stringify({
          extractions: [{ text: "Open AI", label: "organization" }],
        }),
        fuzzyAlignmentThreshold: 1.2,
      }),
    /fuzzyAlignmentThreshold must be between 0 and 1/i,
  );
});
