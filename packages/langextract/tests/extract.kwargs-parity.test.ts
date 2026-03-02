import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";
import { createProviderRegistry, type ProviderDefinition } from "../src/public/providers.js";

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
  };
}

function createMockModel(provider: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider,
    modelId: "model-1",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: `${provider}-response`,
        modelId: "model-1",
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

void test("google kwargs keep allow-listed keys and drop unknown keys", async () => {
  const model = createMockModel("google");
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "google",
  });
  registry.registerProvider(createProviderWithSharedModel("google", model));

  await extract({
    text: "Alice moved to Berlin in 2024.",
    examples: createExamples(),
    provider: "google",
    modelId: "google:model-1",
    registry,
    languageModelParams: {
      tools: ["tool-1"],
      stop_sequences: ["\n\n"],
      system_instruction: "Be helpful",
      candidate_count: 2,
      safety_settings: { HARM_CATEGORY_DANGEROUS: "BLOCK_NONE" },
      unknown_runtime_param: "drop-me",
    },
  });

  const call = model.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = call.providerOptions as Record<string, Record<string, unknown>>;
  const googleOptions = providerOptions.google;
  assert.ok(googleOptions !== undefined);

  assert.deepEqual(googleOptions.tools, ["tool-1"]);
  assert.deepEqual(googleOptions.stop_sequences, ["\n\n"]);
  assert.equal(googleOptions.system_instruction, "Be helpful");
  assert.equal(googleOptions.candidate_count, 2);
  assert.deepEqual(googleOptions.safety_settings, { HARM_CATEGORY_DANGEROUS: "BLOCK_NONE" });
  assert.equal("unknown_runtime_param" in googleOptions, false);
});

void test("google kwargs drop nullish values and keep falsy numeric values", async () => {
  const model = createMockModel("google");
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "google",
  });
  registry.registerProvider(createProviderWithSharedModel("google", model));

  await extract({
    text: "Alice moved to Berlin in 2024.",
    examples: createExamples(),
    provider: "google",
    modelId: "google:model-1",
    registry,
    languageModelParams: {
      candidate_count: null,
      seed: undefined,
      top_p: 0,
      system_instruction: "focused",
    },
  });

  const call = model.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = call.providerOptions as Record<string, Record<string, unknown>>;
  const googleOptions = providerOptions.google;
  assert.ok(googleOptions !== undefined);

  assert.equal("candidate_count" in googleOptions, false);
  assert.equal("seed" in googleOptions, false);
  assert.equal(googleOptions.top_p, 0);
  assert.equal(googleOptions.system_instruction, "focused");
});

void test("openai kwargs keep custom params, normalize aliases, and merge reasoning", async () => {
  const model = createMockModel("openai");
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "openai",
  });
  registry.registerProvider(createProviderWithSharedModel("openai", model));

  await extract({
    text: "Alice moved to Berlin in 2024.",
    examples: createExamples(),
    provider: "openai",
    modelId: "openai:model-1",
    registry,
    languageModelParams: {
      reasoning: { other_field: "value" },
      reasoning_effort: "minimal",
      response_format: { type: "text", schema: "custom" },
      custom_param: "keep-me",
      top_p: null,
      seed: undefined,
      top_logprobs: 0,
    },
  });

  const call = model.doGenerateCalls[0];
  assert.ok(call !== undefined);
  const providerOptions = call.providerOptions as Record<string, Record<string, unknown>>;
  const openaiOptions = providerOptions.openai;
  assert.ok(openaiOptions !== undefined);

  assert.deepEqual(openaiOptions.reasoning, {
    other_field: "value",
    effort: "minimal",
  });
  assert.deepEqual(openaiOptions.responseFormat, { type: "text", schema: "custom" });
  assert.equal(openaiOptions.response_format, undefined);
  assert.equal(openaiOptions.custom_param, "keep-me");
  assert.equal("top_p" in openaiOptions, false);
  assert.equal("seed" in openaiOptions, false);
  assert.equal(openaiOptions.top_logprobs, 0);
});
