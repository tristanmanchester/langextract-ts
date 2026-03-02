import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";
import { createProviderRegistry, type ProviderDefinition } from "../src/public/providers.js";
import { LANGEXTRACT_WARNING_CODES } from "../src/public/types.js";

function createProviderWithDeprecatedAlias(model: MockLanguageModelV3): ProviderDefinition {
  return {
    id: "alpha",
    defaultModelId: "modern-model",
    aliases: {
      legacy: {
        target: "modern-model",
        lifecycle: {
          stage: "deprecated",
          replacement: "modern-model",
        },
      },
    },
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

void test("extract surfaces alias lifecycle warnings through onWarning", async () => {
  const warningCodes: string[] = [];
  const warningMessages: string[] = [];
  const model = new MockLanguageModelV3({
    provider: "alpha",
    modelId: "modern-model",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: '{"extractions":[{"text":"Alice","label":"person"}]}' }],
      warnings: [],
      request: {},
      response: {
        id: "alias-warning-response",
        modelId: "modern-model",
        timestamp: new Date(0),
      },
    },
  });

  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });
  registry.registerProvider(createProviderWithDeprecatedAlias(model));

  const result = await extract({
    text: "Alice",
    examples: [
      {
        text: "Alice",
        extractions: [{ extractionClass: "person", extractionText: "Alice" }],
      },
    ],
    provider: "alpha",
    modelId: "alpha:legacy",
    registry,
    onWarning(warning) {
      warningCodes.push(warning.code);
      warningMessages.push(warning.message);
    },
  });

  assert.equal(result.extractions.length, 1);
  assert.equal(warningCodes.includes(LANGEXTRACT_WARNING_CODES.AliasLifecycle), true);
  assert.equal(
    warningMessages.some((entry) => /deprecated/i.test(entry)),
    true,
  );
});
