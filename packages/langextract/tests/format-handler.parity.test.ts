import assert from "node:assert/strict";
import { test } from "vitest";

import { FormatHandler } from "../src/internal/resolver/format-handler.js";

void test("FormatHandler defaults match parity expectations", () => {
  const handler = new FormatHandler();

  assert.equal(handler.formatType, "json");
  assert.equal(handler.useWrapper, true);
  assert.equal(handler.wrapperKey, "extractions");
  assert.equal(handler.useFences, true);
  assert.equal(handler.attributeSuffix, "_attributes");
  assert.equal(handler.strictFences, false);
  assert.equal(handler.allowTopLevelList, true);
});

void test("FormatHandler parses wrapped JSON and returns extraction list", () => {
  const handler = new FormatHandler();
  const parsed = handler.parse(
    '```json\n{"extractions":[{"text":"Berlin","label":"location"}]}\n```',
  );

  assert.equal(parsed.fromFence, true);
  assert.deepEqual(parsed.value, [{ text: "Berlin", label: "location" }]);
});

void test("FormatHandler strict fences require exactly one valid block", () => {
  const handler = new FormatHandler({ strictFences: true });

  assert.throws(
    () => handler.parse("```json\n{}\n```\n```json\n{}\n```"),
    /Multiple fenced blocks found\. Expected exactly one/,
  );
});

void test("FormatHandler lenient fences accept single wrong-language fence", () => {
  const handler = new FormatHandler({ formatType: "json", strictFences: false });
  const parsed = handler.parse('```yaml\n{"extractions":[]}\n```');

  assert.equal(parsed.fromFence, true);
  assert.deepEqual(parsed.value, []);
});

void test("FormatHandler strips <think> tags in non-strict parse", () => {
  const handler = new FormatHandler({ formatType: "json", useFences: false });

  const parsed = handler.parse(
    '<think>reasoning content</think>\n{"extractions":[{"text":"Alice","label":"person"}]}',
  );

  assert.deepEqual(parsed.value, [{ text: "Alice", label: "person" }]);
});

void test("FormatHandler.fromResolverParams maps legacy keys", () => {
  const result = FormatHandler.fromResolverParams({
    resolverParams: {
      fence_output: false,
      format_type: "yaml",
      strict_fences: true,
      require_extractions_key: false,
      attribute_suffix: "_attrs",
      keep_me: 1,
    },
    baseFormatType: "json",
    baseUseFences: true,
  });

  assert.equal(result.formatHandler.useFences, false);
  assert.equal(result.formatHandler.formatType, "yaml");
  assert.equal(result.formatHandler.strictFences, true);
  assert.equal(result.formatHandler.useWrapper, false);
  assert.equal(result.formatHandler.attributeSuffix, "_attrs");
  assert.deepEqual(result.remainingResolverParams, { keep_me: 1 });
});
