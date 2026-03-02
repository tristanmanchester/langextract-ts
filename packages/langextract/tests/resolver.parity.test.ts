import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createResolverFromResolverParams,
  FormatHandler,
  Resolver,
} from "../src/internal/resolver/index.js";

void test("Resolver respects extraction_index_suffix ordering and skipping", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
    extractionIndexSuffix: "_index",
  });

  const resolved = resolver.resolve({
    sourceText: "Alice Bob",
    modelOutput: JSON.stringify([
      { person: "Bob", person_index: 2 },
      { person: "Alice", person_index: 1 },
      { person: "Charlie" },
    ]),
  });

  assert.equal(resolved.length, 2);
  assert.equal(resolved[0]?.text, "Alice");
  assert.equal(resolved[1]?.text, "Bob");
});

void test("Resolver suppresses parse errors when enabled", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
    suppressParseErrors: true,
  });

  const resolved = resolver.resolve({
    sourceText: "Alice Bob",
    modelOutput: "{invalid-json",
  });

  assert.deepEqual(resolved, []);
});

void test("createResolverFromResolverParams throws on unknown key", () => {
  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          unknown_flag: true,
        },
      }),
    /Unknown key in resolver_params/,
  );
});

void test("createResolverFromResolverParams supports alignment and parse keys", () => {
  const result = createResolverFromResolverParams({
    resolverParams: {
      suppress_parse_errors: true,
      enable_fuzzy_alignment: false,
      fuzzy_alignment_threshold: 0.9,
      accept_match_lesser: false,
    },
  });

  const resolved = result.resolver.resolve({
    sourceText: "Alice works at OpenAI in Berlin.",
    modelOutput:
      '{"extractions":[{"text":"openai","label":"organization"},{"text":"Alyce workplace","label":"person"}]}',
  });

  const first = resolved[0];
  const second = resolved[1];
  assert.ok(first !== undefined);
  assert.ok(second !== undefined);
  assert.equal(first.alignmentStatus, "exact");
  assert.equal(first.start, 15);
  assert.equal(second.alignmentStatus, "fuzzy");
  assert.equal(second.start, -1);
});
