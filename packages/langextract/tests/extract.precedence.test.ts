import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";
import { createProviderRegistry, type ProviderDefinition } from "../src/public/providers.js";
import { LANGEXTRACT_WARNING_CODES } from "../src/public/types.js";

function createMockModel(responseText: string, provider = "mock"): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider,
    modelId: `${provider}-model`,
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: responseText }],
      warnings: [],
      request: {},
      response: {
        id: `mock-response-${provider}`,
        modelId: `${provider}-model`,
        timestamp: new Date(0),
      },
    },
  });
}

function createExamples() {
  return [
    {
      text: "Alice and beta-choice are in this sentence.",
      extractions: [{ extractionClass: "person", extractionText: "Alice" }],
    },
  ] as const;
}

function createStaticProvider(
  id: string,
  responseByModelId: Record<string, string>,
): ProviderDefinition {
  return {
    id,
    defaultModelId: `${id}-default`,
    provider: {
      languageModel(modelId: string) {
        const responseText =
          responseByModelId[modelId] ??
          JSON.stringify({
            extractions: [{ text: "Alice", label: "person" }],
          });

        return new MockLanguageModelV3({
          provider: id,
          modelId,
          doGenerate: {
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            content: [{ type: "text", text: responseText }],
            warnings: [],
            request: {},
            response: {
              id: `response-${id}-${modelId}`,
              modelId,
              timestamp: new Date(0),
            },
          },
        });
      },
      embeddingModel() {
        throw new Error("Not implemented in test provider");
      },
      imageModel() {
        throw new Error("Not implemented in test provider");
      },
      rerankingModel() {
        throw new Error("Not implemented in test provider");
      },
    },
  };
}

void test("extract precedence: config.model overrides routed modelId/provider", async () => {
  const configModel = createMockModel(
    JSON.stringify({
      extractions: [{ text: "Alice", label: "person" }],
    }),
    "config",
  );

  const result = await extract({
    text: "Alice and beta-choice are in this sentence.",
    examples: createExamples(),
    modelId: "openai:gpt-4.1-mini",
    provider: "openai",
    config: {
      model: configModel,
    },
  });

  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.label, "person");
});

void test("extract precedence: config modelId/provider override top-level routing", async () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "alpha" });
  registry.registerProvider(
    createStaticProvider("alpha", {
      "alpha-model": JSON.stringify({
        extractions: [{ text: "Alice", label: "alpha" }],
      }),
    }),
  );
  registry.registerProvider(
    createStaticProvider("beta", {
      "beta-model": JSON.stringify({
        extractions: [{ text: "beta-choice", label: "beta" }],
      }),
    }),
  );

  const result = await extract({
    text: "Alice and beta-choice are in this sentence.",
    examples: createExamples(),
    provider: "alpha",
    modelId: "alpha:alpha-model",
    registry,
    config: {
      provider: "beta",
      modelId: "beta:beta-model",
    },
  });

  assert.equal(result.extractions.length, 1);
  const firstExtraction = result.extractions[0];
  assert.ok(firstExtraction !== undefined);
  assert.equal(firstExtraction.text, "beta-choice");
  assert.equal(firstExtraction.label, "beta");
});

void test("extract resolves fenceOutput from schema hooks that require raw output", async () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "raw" });
  registry.registerProvider({
    ...createStaticProvider("raw", {
      "raw-model": '{"extractions":[{"text":"Alice","label":"person"}]}',
    }),
    schemaHooks: {
      id: "raw-schema",
      requiresRawOutput: true,
      toProviderConfig() {
        return {};
      },
    },
  });

  const result = await extract({
    text: "Alice",
    examples: [
      {
        text: "Alice",
        extractions: [{ extractionClass: "person", extractionText: "Alice" }],
      },
    ],
    provider: "raw",
    modelId: "raw:raw-model",
    registry,
    resolverParams: {
      strict_fences: true,
    },
  });

  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.text, "Alice");
});

void test("extract uses explicit fenceOutput override over schema-hook defaults", async () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "raw" });
  registry.registerProvider({
    ...createStaticProvider("raw", {
      "raw-model": '{"extractions":[{"text":"Alice","label":"person"}]}',
    }),
    schemaHooks: {
      id: "raw-schema",
      requiresRawOutput: true,
      toProviderConfig() {
        return {};
      },
    },
  });

  await assert.rejects(
    extract({
      text: "Alice",
      examples: [
        {
          text: "Alice",
          extractions: [{ extractionClass: "person", extractionText: "Alice" }],
        },
      ],
      provider: "raw",
      modelId: "raw:raw-model",
      registry,
      fenceOutput: true,
      resolverParams: {
        strict_fences: true,
      },
    }),
    /valid fence markers/i,
  );
});

void test("extract emits warning when schema constraints are ignored for explicit model", async () => {
  const warningCodes: string[] = [];

  await extract({
    text: "Alice",
    examples: [
      {
        text: "Alice",
        extractions: [{ extractionClass: "person", extractionText: "Alice" }],
      },
    ],
    model: createMockModel('{"extractions":[{"text":"Alice","label":"person"}]}'),
    useSchemaConstraints: true,
    onWarning(warning) {
      warningCodes.push(warning.code);
    },
  });

  assert.equal(
    warningCodes.includes(LANGEXTRACT_WARNING_CODES.SchemaConstraintsIgnoredWithExplicitModel),
    true,
  );
});

void test("extract emits preflight warnings before missing-examples error", async () => {
  const warningCodes: string[] = [];

  await assert.rejects(
    extract({
      text: "Alice",
      examples: [],
      onWarning(warning) {
        warningCodes.push(warning.code);
      },
    }),
    /Examples are required for reliable extraction/i,
  );

  assert.equal(warningCodes.includes(LANGEXTRACT_WARNING_CODES.MissingExamples), true);
});

void test("extract warns when batchLength is lower than maxWorkers", async () => {
  const warningCodes: string[] = [];

  await extract({
    text: "Alice",
    examples: [
      {
        text: "Alice",
        extractions: [{ extractionClass: "person", extractionText: "Alice" }],
      },
    ],
    model: createMockModel('{"extractions":[{"text":"Alice","label":"person"}]}'),
    batchLength: 1,
    maxWorkers: 2,
    onWarning(warning) {
      warningCodes.push(warning.code);
    },
  });

  assert.equal(warningCodes.includes(LANGEXTRACT_WARNING_CODES.BatchLengthBelowMaxWorkers), true);
});
