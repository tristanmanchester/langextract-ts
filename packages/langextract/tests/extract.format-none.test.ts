import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";

function createModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "custom",
    modelId: "custom-model",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "custom-response",
        modelId: "custom-model",
        timestamp: new Date(0),
      },
    },
  });
}

function createExamples() {
  return [
    {
      text: "Alice moved to Berlin in 2024.",
      extractions: [{ extractionClass: "person", extractionText: "Alice" }],
    },
  ] as const;
}

void test("extract forwards formatType=none to prompt builder without JSON-only instruction", async () => {
  const model = createModel();

  await extract({
    text: "Alice moved to Berlin in 2024.",
    model,
    examples: createExamples(),
    formatType: "none",
    resolverParams: { suppress_parse_errors: true },
  });

  const call = model.doGenerateCalls[0] as { prompt?: unknown; messages?: unknown } | undefined;
  assert.ok(call !== undefined);
  const promptText = extractPromptText(call.prompt ?? call.messages);
  assert.match(promptText, /without enforcing JSON or YAML formatting/i);
  assert.doesNotMatch(promptText, /Return JSON only in this shape:/);
});

void test("extract accepts snake_case format_type=none alias", async () => {
  const model = createModel();

  await extract({
    text: "Alice moved to Berlin in 2024.",
    model,
    examples: createExamples(),
    format_type: "none",
    resolverParams: { suppress_parse_errors: true },
  });

  const call = model.doGenerateCalls[0] as { prompt?: unknown; messages?: unknown } | undefined;
  assert.ok(call !== undefined);
  const promptText = extractPromptText(call.prompt ?? call.messages);
  assert.match(promptText, /without enforcing JSON or YAML formatting/i);
});

void test("extract forwards formatType=yaml to prompt builder", async () => {
  const model = createModel();

  await extract({
    text: "Alice moved to Berlin in 2024.",
    model,
    examples: createExamples(),
    formatType: "yaml",
    resolverParams: { suppress_parse_errors: true },
  });

  const call = model.doGenerateCalls[0] as { prompt?: unknown; messages?: unknown } | undefined;
  assert.ok(call !== undefined);
  const promptText = extractPromptText(call.prompt ?? call.messages);
  assert.match(promptText, /Return YAML only in this shape:/i);
});

void test("extract accepts snake_case format_type=yaml alias", async () => {
  const model = createModel();

  await extract({
    text: "Alice moved to Berlin in 2024.",
    model,
    examples: createExamples(),
    format_type: "yaml",
    resolverParams: { suppress_parse_errors: true },
  });

  const call = model.doGenerateCalls[0] as { prompt?: unknown; messages?: unknown } | undefined;
  assert.ok(call !== undefined);
  const promptText = extractPromptText(call.prompt ?? call.messages);
  assert.match(promptText, /Return YAML only in this shape:/i);
});

function extractPromptText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractPromptText(item)).join("\n");
  }

  if (typeof value !== "object" || value === null) {
    return "";
  }

  const record = value as Record<string, unknown>;
  const textFromTextField = record.text;
  if (typeof textFromTextField === "string") {
    return textFromTextField;
  }

  if ("content" in record) {
    return extractPromptText(record.content);
  }

  if ("messages" in record) {
    return extractPromptText(record.messages);
  }

  return Object.values(record)
    .map((item) => extractPromptText(item))
    .join("\n");
}
