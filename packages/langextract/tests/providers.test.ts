import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import {
  ProviderRegistry,
  loadProviderPlugins,
  registerProviderPlugin,
  type LangextractModel,
  type ProviderDefinition,
} from "../src/internal/providers/index.js";

function createStaticProvider(id: string): ProviderDefinition {
  return {
    id,
    defaultModelId: `${id}-default`,
    provider: {
      languageModel(modelId: string) {
        return new MockLanguageModelV3({
          provider: id,
          modelId,
          doGenerate: {
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            content: [{ type: "text", text: `provider:${id}:model:${modelId}` }],
            warnings: [],
            request: {},
            response: {
              id: `response-${id}-${modelId}`,
              modelId,
              timestamp: new Date(),
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

void test("ProviderRegistry prefers explicit model over modelId/provider routing", async () => {
  const registry = new ProviderRegistry("gateway");
  registry.registerProvider(createStaticProvider("gateway"));
  registry.registerProvider(createStaticProvider("openai"));

  const explicitModel: LangextractModel = {
    provider: "custom",
    modelId: "custom-model",
    model: new MockLanguageModelV3({ provider: "custom", modelId: "custom-model" }),
    fallbackModels: [],
  };

  const resolved = registry.resolveModel({
    model: explicitModel,
    modelId: "openai:gpt-4.1-mini",
    provider: "openai",
  });

  assert.equal(resolved, explicitModel);
});

void test("ProviderRegistry routes by modelId prefix", async () => {
  const registry = new ProviderRegistry("gateway");
  registry.registerProvider(createStaticProvider("gateway"));
  registry.registerProvider(createStaticProvider("openai"));

  const resolved = registry.resolveModel({ modelId: "openai:gpt-4.1-mini" });

  assert.equal(resolved.provider, "openai");
  assert.equal(resolved.modelId, "gpt-4.1-mini");
});

void test("ProviderRegistry resolves aliases and fallback routes", async () => {
  const registry = new ProviderRegistry("gateway");
  registry.registerProvider({
    ...createStaticProvider("gateway"),
    defaultModelId: "google/gemini-3-flash",
    aliases: {
      "google/gemini-3-flash": "google/gemini-3-flash-preview",
    },
    fallbackModelIds: {
      "google/gemini-3-flash": ["google/gemini-2.5-flash", "openai:gpt-4.1-mini"],
      "google/gemini-3-flash-preview": ["google/gemini-2.5-flash", "openai:gpt-4.1-mini"],
    },
  });
  registry.registerProvider(createStaticProvider("openai"));

  const resolved = registry.resolveModel({ modelId: "gateway:google/gemini-3-flash" });

  assert.equal(resolved.modelId, "google/gemini-3-flash-preview");
  assert.equal(resolved.fallbackModels.length, 2);
  const firstFallback = resolved.fallbackModels[0];
  const secondFallback = resolved.fallbackModels[1];
  assert.ok(firstFallback !== undefined);
  assert.ok(secondFallback !== undefined);
  assert.equal(firstFallback.provider, "gateway");
  assert.equal(firstFallback.modelId, "google/gemini-2.5-flash");
  assert.equal(secondFallback.provider, "openai");
  assert.equal(secondFallback.modelId, "gpt-4.1-mini");
});

void test("registerProviderPlugin installs provider definitions", async () => {
  const registry = new ProviderRegistry("gateway");

  await registerProviderPlugin(
    {
      name: "inline-plugin",
      register(target) {
        target.registerProvider(createStaticProvider("plugin"));
      },
    },
    registry,
  );

  assert.equal(registry.hasProvider("plugin"), true);
});

void test("loadProviderPlugins loads plugins from package metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "langextract-provider-plugin-"));
  const nodeModulesPath = path.join(tempRoot, "node_modules");
  const pluginPackagePath = path.join(nodeModulesPath, "example-provider-plugin");

  await mkdir(pluginPackagePath, { recursive: true });

  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "plugin-test-root",
        private: true,
        dependencies: {
          "example-provider-plugin": "1.0.0",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(pluginPackagePath, "package.json"),
    JSON.stringify(
      {
        name: "example-provider-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(pluginPackagePath, "plugin.mjs"),
    [
      "export const providerPlugin = {",
      "  name: 'example-provider-plugin',",
      "  register(registry) {",
      "    registry.registerProvider({",
      "      id: 'plugin-provider',",
      "      defaultModelId: 'plugin-default',",
      "      provider: {",
      "        languageModel() { throw new Error('not used in plugin-load test'); },",
      "        embeddingModel() { throw new Error('not used in plugin-load test'); },",
      "        imageModel() { throw new Error('not used in plugin-load test'); },",
      "        rerankingModel() { throw new Error('not used in plugin-load test'); }",
      "      }",
      "    });",
      "  }",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({
    cwd: tempRoot,
    registry,
  });

  assert.equal(result.failed.length, 0);
  assert.equal(result.loaded.length, 1);
  assert.equal(registry.hasProvider("plugin-provider"), true);
});
