import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { InferenceConfigError, PromptValidationError } from "../src/public/errors.js";
import { extract } from "../src/public/extract.js";
import { createProviderRegistry, type ProviderDefinition } from "../src/public/providers.js";
import { LANGEXTRACT_WARNING_CODES } from "../src/public/types.js";

function createProviderWithSharedModel(id: string, model: MockLanguageModelV3): ProviderDefinition {
  return {
    id,
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
    environmentPolicy: {
      apiKeyEnvs: ["LANGEXTRACT_TEST_KEY_A", "LANGEXTRACT_TEST_KEY_B"],
      baseUrlEnv: "LANGEXTRACT_TEST_BASE_URL",
    },
    schemaHooks: {
      id: "settings-schema",
      requiresRawOutput: false,
      toProviderConfig() {
        return {
          responseFormat: "json_schema",
        };
      },
    },
  };
}

function createPromptLintModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "prompt-lint",
    modelId: "prompt-lint-model",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "prompt-lint-response",
        modelId: "prompt-lint-model",
        timestamp: new Date(0),
      },
    },
  });
}

void test("extract merges env, languageModelParams, and schema provider config into providerOptions", async () => {
  const model = new MockLanguageModelV3({
    provider: "settings",
    modelId: "model-1",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "settings-response",
        modelId: "model-1",
        timestamp: new Date(0),
      },
    },
  });

  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "settings",
  });
  registry.registerProvider(createProviderWithSharedModel("settings", model));

  const previousA = process.env.LANGEXTRACT_TEST_KEY_A;
  const previousB = process.env.LANGEXTRACT_TEST_KEY_B;
  const previousBase = process.env.LANGEXTRACT_TEST_BASE_URL;

  process.env.LANGEXTRACT_TEST_KEY_A = "first-key";
  process.env.LANGEXTRACT_TEST_KEY_B = "second-key";
  process.env.LANGEXTRACT_TEST_BASE_URL = "https://example.test/provider";

  const warningCodes: string[] = [];
  try {
    await extract({
      text: "Alice",
      examples: [
        { text: "Alice", extractions: [{ extractionClass: "person", extractionText: "Alice" }] },
      ],
      provider: "settings",
      modelId: "settings:model-1",
      registry,
      languageModelParams: {
        customHint: "enabled",
      },
      onWarning(warning) {
        warningCodes.push(warning.code);
      },
    });
  } finally {
    process.env.LANGEXTRACT_TEST_KEY_A = previousA;
    process.env.LANGEXTRACT_TEST_KEY_B = previousB;
    process.env.LANGEXTRACT_TEST_BASE_URL = previousBase;
  }

  assert.equal(warningCodes.includes(LANGEXTRACT_WARNING_CODES.ProviderEnvironment), true);

  const firstCall = model.doGenerateCalls[0];
  assert.ok(firstCall !== undefined);
  const providerOptions = firstCall.providerOptions as Record<string, Record<string, unknown>>;
  const settingsOptions = providerOptions.settings;
  assert.ok(settingsOptions !== undefined);
  assert.equal(settingsOptions.apiKey, "first-key");
  assert.equal(settingsOptions.baseURL, "https://example.test/provider");
  assert.equal(settingsOptions.customHint, "enabled");
  assert.equal(settingsOptions.responseFormat, "json_schema");
});

void test("extract respects explicit apiKey/modelUrl overrides over environment", async () => {
  const model = new MockLanguageModelV3({
    provider: "settings",
    modelId: "model-1",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "settings-response-override",
        modelId: "model-1",
        timestamp: new Date(0),
      },
    },
  });

  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "settings",
  });
  registry.registerProvider(createProviderWithSharedModel("settings", model));

  const previousA = process.env.LANGEXTRACT_TEST_KEY_A;
  const previousBase = process.env.LANGEXTRACT_TEST_BASE_URL;

  process.env.LANGEXTRACT_TEST_KEY_A = "env-key";
  process.env.LANGEXTRACT_TEST_BASE_URL = "https://env.example";

  try {
    await extract({
      text: "Alice",
      examples: [
        { text: "Alice", extractions: [{ extractionClass: "person", extractionText: "Alice" }] },
      ],
      provider: "settings",
      modelId: "settings:model-1",
      registry,
      apiKey: "explicit-key",
      modelUrl: "https://explicit.example",
    });
  } finally {
    process.env.LANGEXTRACT_TEST_KEY_A = previousA;
    process.env.LANGEXTRACT_TEST_BASE_URL = previousBase;
  }

  const firstCall = model.doGenerateCalls[0];
  assert.ok(firstCall !== undefined);
  const providerOptions = firstCall.providerOptions as Record<string, Record<string, unknown>>;
  const settingsOptions = providerOptions.settings;
  assert.ok(settingsOptions !== undefined);
  assert.equal(settingsOptions.apiKey, "explicit-key");
  assert.equal(settingsOptions.baseURL, "https://explicit.example");
});

void test("extract normalizes reasoning_effort and merges reasoning metadata", async () => {
  const model = new MockLanguageModelV3({
    provider: "settings",
    modelId: "model-1",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "settings-reasoning",
        modelId: "model-1",
        timestamp: new Date(0),
      },
    },
  });

  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "settings",
  });
  registry.registerProvider(createProviderWithSharedModel("settings", model));

  await extract({
    text: "Alice",
    examples: [
      { text: "Alice", extractions: [{ extractionClass: "person", extractionText: "Alice" }] },
    ],
    provider: "settings",
    modelId: "settings:model-1",
    registry,
    settings: {
      providerOptions: {
        settings: {
          reasoning: {
            other_field: "value",
          },
        },
      },
    },
    languageModelParams: {
      reasoning_effort: "maximal",
      response_format: { type: "json_schema" },
      keepZero: 0,
      shouldDrop: undefined,
    },
  });

  const firstCall = model.doGenerateCalls[0];
  assert.ok(firstCall !== undefined);
  const providerOptions = firstCall.providerOptions as Record<string, Record<string, unknown>>;
  const settingsOptions = providerOptions.settings;
  assert.ok(settingsOptions !== undefined);

  assert.deepEqual(settingsOptions.reasoning, {
    other_field: "value",
    effort: "maximal",
  });
  assert.deepEqual(settingsOptions.responseFormat, { type: "json_schema" });
  assert.equal(settingsOptions.response_format, undefined);
  assert.equal(settingsOptions.keepZero, 0);
  assert.equal("shouldDrop" in settingsOptions, false);
});

void test("extract validates fuzzy alignment threshold resolver params values", async () => {
  await assert.rejects(
    () =>
      extract({
        text: "OpenAI builds models.",
        examples: [
          {
            text: "OpenAI builds models.",
            extractions: [{ extractionClass: "organization", extractionText: "OpenAI" }],
          },
        ],
        resolverParams: {
          fuzzy_alignment_threshold: "0.8" as unknown as number,
        },
      }),
    (error: unknown) =>
      error instanceof InferenceConfigError &&
      /must be a finite number between 0 and 1/i.test(error.message),
  );

  await assert.rejects(
    () =>
      extract({
        text: "OpenAI builds models.",
        examples: [
          {
            text: "OpenAI builds models.",
            extractions: [{ extractionClass: "organization", extractionText: "OpenAI" }],
          },
        ],
        resolverParams: {
          fuzzy_alignment_threshold: Number.NaN,
        },
      }),
    (error: unknown) =>
      error instanceof InferenceConfigError &&
      /must be a finite number between 0 and 1/i.test(error.message),
  );

  await assert.rejects(
    () =>
      extract({
        text: "OpenAI builds models.",
        examples: [
          {
            text: "OpenAI builds models.",
            extractions: [{ extractionClass: "organization", extractionText: "OpenAI" }],
          },
        ],
        resolverParams: {
          fuzzy_alignment_threshold: 1.2,
        },
      }),
    (error: unknown) =>
      error instanceof InferenceConfigError &&
      /fuzzyAlignmentThreshold must be between 0 and 1/i.test(error.message),
  );
});

void test("extract keeps prompt lint off by default for custom prompt templates", async () => {
  const model = createPromptLintModel();

  const result = await extract({
    text: "Alice",
    model,
    examples: [
      { text: "Alice", extractions: [{ extractionClass: "person", extractionText: "Alice" }] },
    ],
    promptTemplate: "Input: {{inputText}}",
  });

  assert.equal(result.extractions.length, 1);
});

void test("extract enforces prompt linting when promptLintLevel is set to error", async () => {
  await assert.rejects(
    () =>
      extract({
        text: "Alice",
        model: createPromptLintModel(),
        examples: [
          {
            text: "Alice",
            extractions: [{ extractionClass: "person", extractionText: "Alice" }],
          },
        ],
        promptTemplate: "Input: {{inputText}}",
        promptLintLevel: "error",
      }),
    (error: unknown) =>
      error instanceof PromptValidationError && /missing-json-instruction/i.test(error.message),
  );
});

void test("extract supports snake_case prompt_lint_level alias", async () => {
  await assert.rejects(
    () =>
      extract({
        text: "Alice",
        model: createPromptLintModel(),
        examples: [
          {
            text: "Alice",
            extractions: [{ extractionClass: "person", extractionText: "Alice" }],
          },
        ],
        promptTemplate: "Input: {{inputText}}",
        prompt_lint_level: "error",
      }),
    (error: unknown) =>
      error instanceof PromptValidationError && /missing-json-instruction/i.test(error.message),
  );
});
