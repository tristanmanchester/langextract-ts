import assert from "node:assert/strict";
import { test } from "vitest";

import { FormatHandler, FormatParseError } from "../src/internal/resolver/format-handler.js";

void test("fromResolverParams prefers explicit FormatHandler and strips legacy keys", () => {
  const explicit = new FormatHandler({
    formatType: "yaml",
    useFences: false,
    useWrapper: false,
  });

  const result = FormatHandler.fromResolverParams({
    resolverParams: {
      format_handler: explicit,
      fence_output: true,
      strict_fences: true,
      extra: "keep",
    },
    baseFormatType: "json",
    baseUseFences: true,
  });

  assert.equal(result.formatHandler, explicit);
  assert.deepEqual(result.legacyKeysUsed, []);
  assert.deepEqual(result.remainingResolverParams, { extra: "keep" });
});

void test("fromResolverParams validates legacy key value types", () => {
  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: { fence_output: "yes" },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /Expected boolean for resolver_params\.fence_output/,
  );

  assert.throws(
    () =>
      FormatHandler.fromResolverParams({
        resolverParams: { attribute_suffix: 42 },
        baseFormatType: "json",
        baseUseFences: true,
      }),
    /Expected string for resolver_params\.attribute_suffix/,
  );
});

void test("parse supports non-wrapper object fallback when wrapper is disabled", () => {
  const handler = new FormatHandler({ useFences: false, useWrapper: false, wrapperKey: null });

  const parsed = handler.parse('{"text":"Alice","label":"person"}');
  assert.deepEqual(parsed.value, [{ text: "Alice", label: "person" }]);
});

void test("parse rejects wrapper violations in strict mode", () => {
  const handler = new FormatHandler({ useFences: false, useWrapper: true });

  assert.throws(
    () => handler.parse('[{"text":"Alice"}]', { strict: true }),
    /Content must be a mapping with an 'extractions' key\./,
  );
});

void test("parse enforces top-level list policy", () => {
  const handler = new FormatHandler({
    useFences: false,
    useWrapper: false,
    allowTopLevelList: false,
  });

  assert.throws(() => handler.parse('[{"text":"Alice"}]'), /Top-level list is not allowed\./);
});

void test("parse rejects non-list extraction payloads", () => {
  const handler = new FormatHandler({
    useFences: false,
    useWrapper: true,
    wrapperKey: "extractions",
  });

  assert.throws(
    () => handler.parse('{"extractions":{"text":"Alice"}}'),
    /must be a sequence \(list\) of mappings/,
  );
});

void test("parse handles strict and lenient fence scenarios", () => {
  const strict = new FormatHandler({ strictFences: true, formatType: "json" });
  assert.throws(() => strict.parse('{"extractions":[]}'), /does not contain valid fence markers/);

  const lenient = new FormatHandler({ strictFences: false, formatType: "json" });
  assert.throws(
    () => lenient.parse("```yaml\n{}\n```\n```md\n{}\n```"),
    /No json code block found/i,
  );

  const parsed = lenient.parse('```md\n{"extractions":[]}\n```');
  assert.equal(parsed.fromFence, true);
});

void test("parse strips think tags only in non-strict mode", () => {
  const handler = new FormatHandler({ useFences: false, formatType: "json" });

  const nonStrict = handler.parse('<think>analysis</think>\n{"extractions":[]}');
  assert.deepEqual(nonStrict.value, []);

  assert.throws(
    () => handler.parse('<think>analysis</think>\n{"extractions":[]}', { strict: true }),
    /Failed to parse JSON content/,
  );
});

void test("yaml parser handles scalar conversions and nested mappings", () => {
  const handler = new FormatHandler({ formatType: "yaml", useFences: false });

  const parsed = handler.parse(
    [
      "extractions:",
      "  - text: 'Alice'",
      "    confidence: 0.75",
      "    active: true",
      "    optional: ~",
      '    quote: "hello"',
      "    details:",
      "      city: Berlin",
      "  - text: Bob",
      "    active: false",
    ].join("\n"),
  );

  assert.equal(parsed.value.length, 2);
  const first = parsed.value[0];
  const second = parsed.value[1];
  assert.ok(first !== undefined);
  assert.ok(second !== undefined);
  assert.equal(first.text, "Alice");
  assert.equal(first.confidence, 0.75);
  assert.equal(first.active, true);
  assert.equal(first.optional, null);
  assert.equal(first.quote, "hello");
  assert.deepEqual(first.details, { city: "Berlin" });
  assert.equal(second.active, false);
});

void test("yaml parser rejects tabs and malformed indent structures", () => {
  const handler = new FormatHandler({ formatType: "yaml", useFences: false });

  assert.throws(() => handler.parse("extractions:\n\t- text: Alice"), /Tabs are not supported/);
  assert.throws(
    () => handler.parse("extractions:\n  - text: Alice\n    - text: Bob"),
    /Invalid sequence indentation|Expected YAML key\/value pair/,
  );
  assert.throws(
    () => handler.parse("extractions:\n  text: Alice\n    city: Berlin\n      deep: value"),
    /Invalid mapping indentation|Expected YAML key\/value pair/,
  );
});

void test("yaml parser rejects malformed key-value lines", () => {
  const handler = new FormatHandler({ formatType: "yaml", useFences: false });

  assert.throws(() => handler.parse("not_a_mapping_line"), /Expected YAML key\/value pair/);
  assert.throws(() => handler.parse(": value"), /Expected YAML key\/value pair/);
});

void test("yaml parser rejects empty YAML input", () => {
  const handler = new FormatHandler({ formatType: "yaml", useFences: false });
  assert.throws(() => handler.parse("\n\n# comments only\n"), /Empty YAML input/);
});

void test("formatExtractionExample emits YAML with nested attribute values", () => {
  const handler = new FormatHandler({ formatType: "yaml", useFences: false });

  const yaml = handler.formatExtractionExample([
    {
      extractionClass: "entity",
      extractionText: "Alice",
      attributes: {
        confidence: 1,
        active: true,
        tags: ["a", "b"],
        note: null,
      },
    },
  ]);

  assert.match(yaml, /extractions:/);
  assert.match(yaml, /entity: "Alice"/);
  assert.match(yaml, /confidence: 1/);
  assert.match(yaml, /active: true/);
  assert.match(yaml, /tags:/);
});

void test("FormatParseError exposes original input", () => {
  const error = new FormatParseError("bad", "raw-input");
  assert.equal(error.name, "FormatParseError");
  assert.equal(error.originalInput, "raw-input");
});
