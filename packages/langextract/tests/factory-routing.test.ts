import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import {
  createProviderRegistry,
  getProviderCapability,
  getProviderRoutingMetadata,
  listProviderCapabilities,
  registerFallbackRoute,
  registerModelAlias,
  registerProvider,
  registerProviderRoutePattern,
  resolveModel,
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

void test("factory routing: createProviderRegistry(registerBuiltins=false) uses only registered providers", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });

  registerProvider(createStaticProvider("alpha"), registry);
  registerProvider(createStaticProvider("beta"), registry);

  const resolved = resolveModel({ modelId: "beta:model-b" }, registry);

  assert.equal(resolved.provider, "beta");
  assert.equal(resolved.modelId, "model-b");
});

void test("factory routing helpers apply pattern, alias, and fallback routes", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });

  registerProvider(createStaticProvider("alpha"), registry);
  registerProvider(createStaticProvider("beta"), registry);
  registerProvider(createStaticProvider("gamma"), registry);

  registerProviderRoutePattern("beta", "^beta/", 5, registry);
  registerModelAlias("beta:beta/main", "gamma:gamma/main", registry);
  registerFallbackRoute(
    "gamma:gamma/main",
    ["alpha:alpha/fallback", "alpha:alpha/fallback"],
    registry,
  );

  const resolved = resolveModel({ modelId: "beta/main" }, registry);

  assert.equal(resolved.provider, "gamma");
  assert.equal(resolved.modelId, "gamma/main");
  assert.equal(resolved.fallbackModels.length, 1);
  const firstFallback = resolved.fallbackModels[0];
  assert.ok(firstFallback !== undefined);
  assert.equal(firstFallback.provider, "alpha");
  assert.equal(firstFallback.modelId, "alpha/fallback");
});

void test("registerModelAlias supports lifecycle policy in public API", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });

  registerProvider(createStaticProvider("alpha"), registry);
  registerModelAlias(
    "alpha:legacy",
    "alpha:modern",
    {
      stage: "deprecated",
      replacement: "alpha:modern",
    },
    registry,
  );

  const resolved = resolveModel({ modelId: "alpha:legacy" }, registry);
  assert.equal(resolved.provider, "alpha");
  assert.equal(resolved.modelId, "modern");
  assert.equal((resolved.routingWarnings ?? []).length, 1);
  assert.match(resolved.routingWarnings?.[0] ?? "", /deprecated/i);

  const metadata = getProviderRoutingMetadata(registry);
  assert.deepEqual(metadata.aliases, [
    {
      alias: "alpha:legacy",
      target: "alpha:modern",
      lifecycleStage: "deprecated",
      replacement: "alpha:modern",
    },
  ]);
});

void test("getProviderRoutingMetadata exposes normalized routing state", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });

  registerProvider(createStaticProvider("alpha"), registry);
  registerProvider(createStaticProvider("beta"), registry);
  registerProviderRoutePattern("beta", /^beta\//i, 7, registry);
  registerModelAlias("alpha:model-a", "beta:model-b", registry);
  registerFallbackRoute("beta:model-b", ["alpha:model-c"], registry);

  const metadata = getProviderRoutingMetadata(registry);

  assert.equal(metadata.defaultProviderId, "alpha");
  assert.deepEqual(metadata.providers, ["alpha", "beta"]);
  assert.deepEqual(metadata.aliases, [{ alias: "alpha:model-a", target: "beta:model-b" }]);
  assert.deepEqual(metadata.fallbackRoutes, [
    { route: "beta:model-b", fallbackRoutes: ["alpha:model-c"] },
  ]);
  const firstPattern = metadata.routePatterns[0];
  assert.ok(firstPattern !== undefined);
  assert.equal(firstPattern.providerId, "beta");
  assert.equal(firstPattern.priority, 7);
  assert.equal(firstPattern.pattern, "^beta\\/");
});

void test("provider capability helpers report schema-hook support", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "alpha",
  });

  registerProvider(createStaticProvider("alpha"), registry);
  registerProvider(
    {
      ...createStaticProvider("schema"),
      schemaHooks: {
        id: "schema-hooks",
        requiresRawOutput: true,
        toProviderConfig() {
          return { outputSchema: true };
        },
      },
    },
    registry,
  );

  const capability = getProviderCapability("schema", registry);
  assert.ok(capability !== undefined);
  assert.equal(capability.providerId, "schema");
  assert.equal(capability.hasSchemaHooks, true);
  assert.equal(capability.supportsSchemaSynthesis, true);
  assert.equal(capability.requiresRawOutput, true);
  assert.equal(capability.schemaHookId, "schema-hooks");

  const allCapabilities = listProviderCapabilities(registry);
  assert.deepEqual(
    allCapabilities.map((entry) => entry.providerId),
    ["alpha", "schema"],
  );
});

void test("resolveModel keeps explicit model objects untouched in factory wrapper", () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "alpha" });
  registerProvider(createStaticProvider("alpha"), registry);

  const explicitModel = new MockLanguageModelV3({ provider: "manual", modelId: "manual-model" });
  const resolved = resolveModel(
    {
      model: explicitModel,
      provider: "manual",
      modelId: "manual-id",
    },
    registry,
  );

  assert.equal(resolved.provider, "manual");
  assert.equal(resolved.modelId, "manual-id");
  assert.equal(resolved.model, explicitModel);
  assert.deepEqual(resolved.fallbackModels, []);
});
