import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import {
  DEFAULT_PUBLIC_GATEWAY_MODEL_ID,
  createProviderRegistry,
  getDefaultProviderRegistry,
  loadProviderPlugins,
  loadProviderPluginsOnce,
  registerProviderPlugin,
  resolveProviderEnvironment,
  type ProviderDefinition,
} from "../src/public/providers.js";

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
            content: [{ type: "text", text: `provider:${id}:${modelId}` }],
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

async function createWorkspaceWithPlugin(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "langextract-public-provider-plugin-"));
  const nodeModulesPath = path.join(root, "node_modules");
  const pluginPackagePath = path.join(nodeModulesPath, "public-provider-plugin");

  await mkdir(pluginPackagePath, { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "public-provider-plugin-workspace",
        private: true,
        dependencies: {
          "public-provider-plugin": "1.0.0",
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
        name: "public-provider-plugin",
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
      "  register(registry) {",
      "    registry.registerProvider({",
      "      id: 'workspace-provider',",
      "      defaultModelId: 'workspace-model',",
      "      provider: {",
      "        languageModel() { throw new Error('unused'); },",
      "        embeddingModel() { throw new Error('unused'); },",
      "        imageModel() { throw new Error('unused'); },",
      "        rerankingModel() { throw new Error('unused'); }",
      "      }",
      "    });",
      "  }",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );

  return root;
}

void test("public registerProviderPlugin registers providers on the supplied registry", async () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "test" });

  const pluginName = await registerProviderPlugin(
    {
      name: "public-plugin",
      register(target) {
        target.registerProvider(createStaticProvider("registered-by-public-wrapper"));
      },
    },
    registry,
  );

  assert.equal(pluginName, "public-plugin");
  assert.equal(registry.hasProvider("registered-by-public-wrapper"), true);
});

void test("public loadProviderPlugins short-circuits when plugins are disabled by env", async () => {
  const previous = process.env.LANGEXTRACT_DISABLE_PLUGINS;
  process.env.LANGEXTRACT_DISABLE_PLUGINS = "1";

  try {
    const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "test" });
    const result = await loadProviderPlugins({
      registry,
      cwd: "/tmp/does-not-matter-when-disabled",
    });

    assert.deepEqual(result, {
      loaded: [],
      failed: [],
    });
  } finally {
    if (previous === undefined) {
      delete process.env.LANGEXTRACT_DISABLE_PLUGINS;
    } else {
      process.env.LANGEXTRACT_DISABLE_PLUGINS = previous;
    }
  }
});

void test("public loadProviderPluginsOnce caches results and forceReload resets cache", async () => {
  const workspace = await createWorkspaceWithPlugin();
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "test" });

  const previousDisable = process.env.LANGEXTRACT_DISABLE_PLUGINS;
  process.env.LANGEXTRACT_DISABLE_PLUGINS = "1";

  try {
    const initial = await loadProviderPluginsOnce({
      forceReload: true,
      registry,
      cwd: workspace,
    });
    assert.equal(initial.loaded.length, 0);
    assert.equal(initial.failed.length, 0);

    delete process.env.LANGEXTRACT_DISABLE_PLUGINS;
    const cached = await loadProviderPluginsOnce({
      registry,
      cwd: workspace,
    });
    assert.equal(cached.loaded.length, 0);
    assert.equal(cached.failed.length, 0);

    const reloaded = await loadProviderPluginsOnce({
      forceReload: true,
      registry,
      cwd: workspace,
    });
    assert.equal(reloaded.loaded.length, 1);
    assert.equal(reloaded.loaded[0]?.packageName, "public-provider-plugin");
    assert.equal(registry.hasProvider("workspace-provider"), true);
  } finally {
    if (previousDisable === undefined) {
      delete process.env.LANGEXTRACT_DISABLE_PLUGINS;
    } else {
      process.env.LANGEXTRACT_DISABLE_PLUGINS = previousDisable;
    }
    await loadProviderPluginsOnce({ forceReload: true });
  }
});

void test("public default registry wrapper returns a singleton with builtins", () => {
  const first = getDefaultProviderRegistry();
  const second = getDefaultProviderRegistry();

  assert.equal(first, second);
  assert.equal(first.hasProvider("gateway"), true);
  assert.equal(DEFAULT_PUBLIC_GATEWAY_MODEL_ID, "google/gemini-3-flash");
});

void test("public resolveProviderEnvironment forwards explicit key/base URL", () => {
  const registry = createProviderRegistry({ registerBuiltins: true, defaultProviderId: "gateway" });
  const resolved = resolveProviderEnvironment(
    "openai:gpt-4.1-mini",
    "explicit-key",
    "https://api.example.test/v1",
    registry,
  );

  assert.equal(resolved.apiKey, "explicit-key");
  assert.equal(resolved.baseUrl, "https://api.example.test/v1");
  assert.deepEqual(resolved.warnings, []);
});
