import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createResolverFromResolverParams,
  FormatHandler,
  FormatParseError,
  Resolver,
} from "../src/internal/resolver/index.js";

void test("FormatHandler strict parse rejects top-level list when wrapper is required", () => {
  const handler = new FormatHandler({ useFences: false, useWrapper: true });

  assert.throws(
    () => handler.parse('[{"text":"Alice","label":"person"}]', { strict: true }),
    /mapping with an 'extractions' key/i,
  );
});

void test("FormatHandler can disallow top-level list when wrapper is disabled", () => {
  const handler = new FormatHandler({
    useFences: false,
    useWrapper: false,
    allowTopLevelList: false,
  });

  assert.throws(
    () => handler.parse('[{"text":"Alice","label":"person"}]'),
    /Top-level list is not allowed/i,
  );
});

void test("FormatHandler useWrapper=false accepts single object payload", () => {
  const handler = new FormatHandler({ useFences: false, useWrapper: false });

  const parsed = handler.parse('{"text":"Alice","label":"person"}');

  assert.deepEqual(parsed.value, [{ text: "Alice", label: "person" }]);
});

void test("FormatHandler strict mode does not apply <think> fallback cleanup", () => {
  const handler = new FormatHandler({ useFences: false, formatType: "json" });

  assert.throws(
    () =>
      handler.parse('<think>analysis</think>{"extractions":[{"text":"Alice","label":"person"}]}', {
        strict: true,
      }),
    /Failed to parse JSON content/i,
  );
});

void test("FormatHandler errors on multiple unmatched fences in lenient mode", () => {
  const handler = new FormatHandler({ formatType: "json", strictFences: false });

  assert.throws(
    () =>
      handler.parse(
        ["```yaml", "extractions: []", "```", "```yaml", "extractions: []", "```"].join("\n"),
      ),
    /No json code block found/i,
  );
});

void test("FormatHandler.fromResolverParams honors explicit format_handler instance", () => {
  const explicit = new FormatHandler({
    formatType: "yaml",
    useFences: false,
    strictFences: true,
    attributeSuffix: "_attrs",
  });

  const result = FormatHandler.fromResolverParams({
    resolverParams: {
      format_handler: explicit,
      fence_output: true,
      format_type: "json",
      strict_fences: false,
      require_extractions_key: true,
      extraction_attributes_suffix: "_ignored",
      keep: "value",
    },
    baseFormatType: "json",
    baseUseFences: true,
  });

  assert.equal(result.formatHandler, explicit);
  assert.deepEqual(result.legacyKeysUsed, []);
  assert.deepEqual(result.remainingResolverParams, { keep: "value" });
});

void test("FormatHandler.fromResolverParams accepts structural format_handler config objects", () => {
  const result = FormatHandler.fromResolverParams({
    resolverParams: {
      format_handler: {
        format_type: "yaml",
        use_wrapper: false,
        use_fences: false,
        attribute_suffix: "_attrs",
        strict_fences: true,
        allow_top_level_list: false,
      },
      keep: "value",
    },
    baseFormatType: "json",
    baseUseFences: true,
  });

  const { formatHandler } = result;
  assert.equal(formatHandler.formatType, "yaml");
  assert.equal(formatHandler.useWrapper, false);
  assert.equal(formatHandler.useFences, false);
  assert.equal(formatHandler.attributeSuffix, "_attrs");
  assert.equal(formatHandler.strictFences, true);
  assert.equal(formatHandler.allowTopLevelList, false);
  assert.deepEqual(result.remainingResolverParams, { keep: "value" });
  assert.deepEqual(result.legacyKeysUsed, []);
});

void test("FormatHandler.fromResolverParams validates structural format_handler field types", () => {
  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: {
          format_handler: {
            useFences: "yes",
          },
        },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /format_handler\.useFences/i,
  );
});

void test("FormatHandler.fromResolverParams accepts camelCase structural config with wrapper disabled", () => {
  const result = FormatHandler.fromResolverParams({
    resolverParams: {
      format_handler: {
        formatType: "json",
        useWrapper: false,
        wrapperKey: null,
        useFences: true,
        attributeSuffix: "_a",
        strictFences: false,
        allowTopLevelList: true,
      },
    },
    baseFormatType: "yaml",
    baseUseFences: false,
  });

  assert.equal(result.formatHandler.formatType, "json");
  assert.equal(result.formatHandler.useWrapper, false);
  assert.equal(result.formatHandler.wrapperKey, undefined);
  assert.equal(result.formatHandler.useFences, true);
  assert.equal(result.formatHandler.attributeSuffix, "_a");
  assert.equal(result.formatHandler.strictFences, false);
  assert.equal(result.formatHandler.allowTopLevelList, true);
});

void test("FormatHandler.fromResolverParams validates structural format_handler object shape", () => {
  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: {
          format_handler: "invalid",
        },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /resolver_params\.format_handler/i,
  );

  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: {
          format_handler: {
            wrapperKey: 123,
          },
        },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /format_handler\.wrapperKey/i,
  );

  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: {
          format_handler: {
            allowTopLevelList: "no",
          },
        },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /format_handler\.allowTopLevelList/i,
  );
});

void test("createResolverFromResolverParams validates numeric alignment threshold type", () => {
  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          fuzzy_alignment_threshold: Number.NaN,
        },
      }),
    /Expected number for resolver_params\.fuzzy_alignment_threshold/i,
  );
});

void test("createResolverFromResolverParams validates fuzzy alignment threshold range", () => {
  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          fuzzy_alignment_threshold: -0.01,
        },
      }),
    /fuzzyAlignmentThreshold must be between 0 and 1/i,
  );

  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          fuzzyAlignmentThreshold: 1.01,
        },
      }),
    /fuzzyAlignmentThreshold must be between 0 and 1/i,
  );
});

void test("Resolver wraps non-FormatParseError failures during parse", () => {
  const fakeFormatHandler = {
    parse() {
      throw new Error("boom");
    },
    attributeSuffix: "_attributes",
  } as unknown as FormatHandler;

  const resolver = new Resolver({ formatHandler: fakeFormatHandler });

  assert.throws(
    () => resolver.resolve({ sourceText: "Alice", modelOutput: "ignored" }),
    (error: unknown) =>
      error instanceof FormatParseError &&
      /Failed to parse model output/i.test(error.message) &&
      error.originalInput === "ignored",
  );
});

void test("Resolver input suppressParseErrors overrides constructor default", () => {
  const fakeFormatHandler = {
    parse() {
      throw new FormatParseError("parse failed", "invalid");
    },
    attributeSuffix: "_attributes",
  } as unknown as FormatHandler;

  const resolver = new Resolver({
    formatHandler: fakeFormatHandler,
    suppressParseErrors: false,
  });

  const resolved = resolver.resolve({
    sourceText: "Alice",
    modelOutput: "invalid",
    suppressParseErrors: true,
  });

  assert.deepEqual(resolved, []);
});

void test("Resolver does not suppress unexpected parser exceptions", () => {
  const fakeFormatHandler = {
    parse() {
      throw new Error("boom");
    },
    attributeSuffix: "_attributes",
  } as unknown as FormatHandler;

  const resolver = new Resolver({
    formatHandler: fakeFormatHandler,
    suppressParseErrors: true,
  });

  assert.throws(
    () =>
      resolver.resolve({
        sourceText: "Alice",
        modelOutput: "invalid",
      }),
    (error: unknown) =>
      error instanceof FormatParseError &&
      /Failed to parse model output/i.test(error.message) &&
      error.originalInput === "invalid",
  );
});

void test("createResolverFromResolverParams accepts null alignment threshold", () => {
  const result = createResolverFromResolverParams({
    resolverParams: {
      fuzzy_alignment_threshold: null,
    },
  });

  const resolved = result.resolver.resolve({
    sourceText: "Alice",
    modelOutput: '{"extractions":[{"text":"Alice","label":"person","start":0,"end":5}]}',
  });

  assert.equal(resolved.length, 1);
  const first = resolved[0];
  assert.ok(first !== undefined);
  assert.equal(first.start, 0);
  assert.equal(first.end, 5);
});

void test("Resolver accepts numeric confidence and integer bounds directly", () => {
  const resolver = new Resolver({
    formatHandler: new FormatHandler({ useFences: false, formatType: "json" }),
  });

  const resolved = resolver.resolve({
    sourceText: "Alice in Berlin",
    modelOutput: JSON.stringify({
      extractions: [
        {
          text: "Berlin",
          label: "location",
          start: 9,
          end: 15,
          confidence: 0.9,
        },
      ],
    }),
  });

  assert.equal(resolved.length, 1);
  const first = resolved[0];
  assert.ok(first !== undefined);
  assert.equal(first.start, 9);
  assert.equal(first.end, 15);
  assert.equal(first.confidence, 0.9);
});

void test("createResolverFromResolverParams validates string and boolean keys", () => {
  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          extraction_index_suffix: 123,
        },
      }),
    /Expected string for resolver_params\.extraction_index_suffix/i,
  );

  assert.throws(
    () =>
      createResolverFromResolverParams({
        resolverParams: {
          enable_fuzzy_alignment: "true",
        },
      }),
    /Expected boolean for resolver_params\.enable_fuzzy_alignment/i,
  );
});
