import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";
import { FormatHandler } from "../src/internal/resolver/index.js";
import { createProviderRegistry, type ProviderDefinition } from "../src/public/providers.js";
import { LANGEXTRACT_WARNING_CODES } from "../src/public/types.js";

function createSchemaProvider(
  model: MockLanguageModelV3,
  requiresRawOutput: boolean,
): ProviderDefinition {
  return {
    id: "schema",
    defaultModelId: "model-1",
    provider: {
      languageModel() {
        return model;
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
    schemaHooks: {
      id: "schema-hooks",
      requiresRawOutput,
      toProviderConfig() {
        return {
          responseFormat: "json_schema",
          schemaVersion: "v1",
        };
      },
    },
  };
}

function createMockModel(provider = "schema", payload?: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider,
    modelId: "model-1",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [
        {
          type: "text",
          text: payload ?? '```json\n{"extractions":[{"text":"Alice","label":"person"}]}\n```',
        },
      ],
      warnings: [],
      request: {},
      response: {
        id: "schema-response",
        modelId: "model-1",
        timestamp: new Date(0),
      },
    },
  });
}

function createExamples() {
  return [
    {
      text: "Alice moved to Berlin.",
      extractions: [{ extractionClass: "person", extractionText: "Alice" }],
    },
  ] as const;
}

void test("extract applies provider schema config when useSchemaConstraints is enabled", async () => {
  const model = createMockModel();
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, false));

  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    provider: "schema",
    modelId: "schema:model-1",
    registry,
    useSchemaConstraints: true,
  });

  const call = model.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = call.providerOptions as Record<string, Record<string, unknown>>;
  const schemaOptions = providerOptions.schema;
  assert.ok(schemaOptions !== undefined);
  assert.equal(schemaOptions.responseFormat, "json_schema");
  assert.equal(schemaOptions.schemaVersion, "v1");
});

void test("extract skips provider schema config when useSchemaConstraints is disabled", async () => {
  const model = createMockModel();
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, false));

  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    provider: "schema",
    modelId: "schema:model-1",
    registry,
    useSchemaConstraints: false,
  });

  const call = model.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = (call.providerOptions ?? {}) as Record<string, Record<string, unknown>>;
  const schemaOptions = providerOptions.schema;
  assert.ok(schemaOptions === undefined || typeof schemaOptions === "object");
  if (schemaOptions === undefined) {
    return;
  }
  assert.equal(schemaOptions.responseFormat, undefined);
  assert.equal(schemaOptions.schemaVersion, undefined);
});

void test("extract emits warning and skips schema hooks when explicit model is provided", async () => {
  const warningCodes: string[] = [];
  const explicitModel = createMockModel("schema");

  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    model: explicitModel,
    useSchemaConstraints: true,
    onWarning(warning) {
      warningCodes.push(warning.code);
    },
  });

  assert.equal(
    warningCodes.includes(LANGEXTRACT_WARNING_CODES.SchemaConstraintsIgnoredWithExplicitModel),
    true,
  );

  const call = explicitModel.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = (call.providerOptions ?? {}) as Record<string, Record<string, unknown>>;
  const schemaOptions = providerOptions.schema ?? {};
  assert.equal(schemaOptions.responseFormat, undefined);
  assert.equal(schemaOptions.schemaVersion, undefined);
});

void test("extract keeps fence output strictness when schema hooks do not require raw output", async () => {
  const model = createMockModel("schema", '{"extractions":[{"text":"Alice","label":"person"}]}');
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, false));

  await assert.rejects(
    extract({
      text: "Alice moved to Berlin.",
      examples: createExamples(),
      provider: "schema",
      modelId: "schema:model-1",
      registry,
      resolverParams: {
        strict_fences: true,
      },
    }),
    /valid fence markers/i,
  );
});

void test("extract emits schema-fence warning when raw-output schema is used with fences", async () => {
  const model = createMockModel("schema", '{"extractions":[{"text":"Alice","label":"person"}]}');
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, true));

  const warnings: string[] = [];
  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    provider: "schema",
    modelId: "schema:model-1",
    registry,
    fenceOutput: true,
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  assert.equal(warnings.includes(LANGEXTRACT_WARNING_CODES.SchemaFencesIncompatible), true);
});

void test("extract emits schema-wrapper warning when wrapper settings are incompatible", async () => {
  const model = createMockModel("schema", '{"text":"Alice","label":"person"}');
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, true));

  const warnings: string[] = [];
  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    provider: "schema",
    modelId: "schema:model-1",
    registry,
    fenceOutput: false,
    resolverParams: {
      format_handler: new FormatHandler({
        useFences: false,
        useWrapper: false,
      }),
    },
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  assert.equal(warnings.includes(LANGEXTRACT_WARNING_CODES.SchemaWrapperIncompatible), true);
});

void test("extract does not emit schema format warnings for compatible raw-output settings", async () => {
  const model = createMockModel("schema", '{"extractions":[{"text":"Alice","label":"person"}]}');
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider(createSchemaProvider(model, true));

  const warnings: string[] = [];
  await extract({
    text: "Alice moved to Berlin.",
    examples: createExamples(),
    provider: "schema",
    modelId: "schema:model-1",
    registry,
    fenceOutput: false,
    resolverParams: {
      format_handler: new FormatHandler({
        useFences: false,
        useWrapper: true,
        wrapperKey: "extractions",
      }),
    },
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  assert.equal(warnings.includes(LANGEXTRACT_WARNING_CODES.SchemaFencesIncompatible), false);
  assert.equal(warnings.includes(LANGEXTRACT_WARNING_CODES.SchemaWrapperIncompatible), false);
});

void test("extract rejects non-object schema hook provider config", async () => {
  const model = createMockModel("schema", '{"extractions":[{"text":"Alice","label":"person"}]}');
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "schema" });
  registry.registerProvider({
    ...createSchemaProvider(model, true),
    schemaHooks: {
      id: "schema-hooks",
      requiresRawOutput: true,
      toProviderConfig() {
        return "invalid" as unknown as Record<string, unknown>;
      },
    },
  });

  await assert.rejects(
    extract({
      text: "Alice moved to Berlin.",
      examples: createExamples(),
      provider: "schema",
      modelId: "schema:model-1",
      registry,
      fenceOutput: false,
    }),
    /must return an object/i,
  );
});
