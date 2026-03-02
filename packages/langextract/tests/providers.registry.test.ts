import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { ProviderRegistry, type ProviderDefinition } from "../src/internal/providers/index.js";

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

void test("ProviderRegistry rejects duplicate provider registration", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));

  assert.throws(
    () => registry.registerProvider(createStaticProvider("alpha")),
    /already registered/i,
  );
});

void test("ProviderRegistry route-pattern registration requires existing provider", () => {
  const registry = new ProviderRegistry("alpha");

  assert.throws(
    () => registry.registerProviderRoutePattern("missing", "^gpt"),
    /is not registered/i,
  );
});

void test("ProviderRegistry setDefaultProvider rejects unknown provider ids", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));

  assert.throws(() => registry.setDefaultProvider("missing"), /Cannot set unknown provider/i);
});

void test("ProviderRegistry detects alias cycles", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));

  registry.registerModelAlias("alpha:a", "alpha:b");
  registry.registerModelAlias("alpha:b", "alpha:a");

  assert.throws(() => registry.resolveModel({ modelId: "alpha:a" }), /alias cycle/i);
});

void test("ProviderRegistry emits routing warnings for deprecated aliases", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("alpha"),
    aliases: {
      legacy: {
        target: "alpha-modern",
        lifecycle: {
          stage: "deprecated",
          replacement: "alpha-modern",
        },
      },
    },
  });

  const resolved = registry.resolveModel({ modelId: "alpha:legacy" });

  assert.equal(resolved.provider, "alpha");
  assert.equal(resolved.modelId, "alpha-modern");
  assert.equal((resolved.routingWarnings ?? []).length, 1);
  assert.match(resolved.routingWarnings?.[0] ?? "", /deprecated/i);
});

void test("ProviderRegistry blocks sunset aliases unless override env is set", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("alpha"),
    aliases: {
      sunset: {
        target: "alpha-modern",
        lifecycle: {
          stage: "sunset",
          replacement: "alpha-modern",
        },
      },
    },
  });

  const previous = process.env.LANGEXTRACT_ALLOW_SUNSET_ALIASES;
  delete process.env.LANGEXTRACT_ALLOW_SUNSET_ALIASES;

  try {
    assert.throws(() => registry.resolveModel({ modelId: "alpha:sunset" }), /sunset stage/i);

    process.env.LANGEXTRACT_ALLOW_SUNSET_ALIASES = "1";
    const resolved = registry.resolveModel({ modelId: "alpha:sunset" });
    assert.equal(resolved.provider, "alpha");
    assert.equal(resolved.modelId, "alpha-modern");
    assert.equal((resolved.routingWarnings ?? []).length, 1);
    assert.match(resolved.routingWarnings?.[0] ?? "", /sunset/i);
  } finally {
    if (previous === undefined) {
      delete process.env.LANGEXTRACT_ALLOW_SUNSET_ALIASES;
    } else {
      process.env.LANGEXTRACT_ALLOW_SUNSET_ALIASES = previous;
    }
  }
});

void test("ProviderRegistry blocks removed aliases", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("alpha"),
    aliases: {
      removed: {
        target: "alpha-modern",
        lifecycle: {
          stage: "removed",
          replacement: "alpha-modern",
        },
      },
    },
  });

  assert.throws(() => registry.resolveModel({ modelId: "alpha:removed" }), /has been removed/i);
});

void test("ProviderRegistry enforces max alias depth", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));

  for (let index = 0; index < 17; index += 1) {
    registry.registerModelAlias(`alpha:m${index}`, `alpha:m${index + 1}`);
  }

  assert.throws(() => registry.resolveModel({ modelId: "alpha:m0" }), /depth exceeded 16/i);
});

void test("ProviderRegistry chooses highest-priority pattern and breaks ties by provider id", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));
  registry.registerProvider(createStaticProvider("beta"));

  registry.registerProviderRoutePattern("beta", "^gpt", 10);
  registry.registerProviderRoutePattern("alpha", "^gpt", 10);

  const resolved = registry.resolveModel({ modelId: "gpt-4.1" });

  assert.equal(resolved.provider, "alpha");
  assert.equal(resolved.modelId, "gpt-4.1");
});

void test("ProviderRegistry resolveEnvironmentForRoute reads env policies and warns on multiple keys", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("alpha"),
    environmentPolicy: {
      apiKeyEnvs: ["TEST_ALPHA_KEY_A", "TEST_ALPHA_KEY_B"],
      baseUrlEnv: "TEST_ALPHA_BASE_URL",
    },
  });

  const previousA = process.env.TEST_ALPHA_KEY_A;
  const previousB = process.env.TEST_ALPHA_KEY_B;
  const previousBase = process.env.TEST_ALPHA_BASE_URL;

  process.env.TEST_ALPHA_KEY_A = "key-a";
  process.env.TEST_ALPHA_KEY_B = "key-b";
  process.env.TEST_ALPHA_BASE_URL = "https://alpha.example";

  try {
    const fromEnv = registry.resolveEnvironmentForRoute("alpha:model", undefined, undefined);
    assert.equal(fromEnv.apiKey, "key-a");
    assert.equal(fromEnv.baseUrl, "https://alpha.example");
    assert.equal(fromEnv.warnings.length, 1);
    assert.match(fromEnv.warnings[0] ?? "", /Multiple API keys detected/i);

    const explicit = registry.resolveEnvironmentForRoute(
      "alpha:model",
      "explicit-key",
      "https://explicit.example",
    );
    assert.equal(explicit.apiKey, "explicit-key");
    assert.equal(explicit.baseUrl, "https://explicit.example");
  } finally {
    if (previousA === undefined) {
      delete process.env.TEST_ALPHA_KEY_A;
    } else {
      process.env.TEST_ALPHA_KEY_A = previousA;
    }

    if (previousB === undefined) {
      delete process.env.TEST_ALPHA_KEY_B;
    } else {
      process.env.TEST_ALPHA_KEY_B = previousB;
    }

    if (previousBase === undefined) {
      delete process.env.TEST_ALPHA_BASE_URL;
    } else {
      process.env.TEST_ALPHA_BASE_URL = previousBase;
    }
  }
});

void test("ProviderRegistry resolveEnvironmentForRoute returns explicit values for unknown providers", () => {
  const registry = new ProviderRegistry("alpha");

  const resolved = registry.resolveEnvironmentForRoute(
    "missing:model",
    "explicit-key",
    "https://explicit.example",
  );

  assert.equal(resolved.apiKey, "explicit-key");
  assert.equal(resolved.baseUrl, "https://explicit.example");
  assert.deepEqual(resolved.warnings, []);
});

void test("ProviderRegistry warns when ollama api key is used with localhost urls", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("ollama"),
    environmentPolicy: {
      apiKeyEnvs: ["TEST_OLLAMA_KEY"],
      baseUrlEnv: "TEST_OLLAMA_BASE_URL",
    },
  });

  const localhostUrls = [
    "http://localhost:11434/v1",
    "https://localhost:11434",
    "http://127.0.0.1:8080/",
    "http://[::1]:11434",
  ];

  for (const baseUrl of localhostUrls) {
    const resolved = registry.resolveEnvironmentForRoute("ollama:model", "api-key", baseUrl);
    assert.equal(resolved.apiKey, "api-key");
    assert.equal(resolved.baseUrl, baseUrl);
    assert.equal(
      resolved.warnings.some((warning) => /localhost/i.test(warning)),
      true,
    );
  }
});

void test("ProviderRegistry warns when ollama default localhost base url is used with an API key", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("ollama"),
    environmentPolicy: {
      apiKeyEnvs: ["TEST_OLLAMA_KEY"],
      baseUrlEnv: "TEST_OLLAMA_BASE_URL",
    },
  });

  const previousBase = process.env.TEST_OLLAMA_BASE_URL;
  delete process.env.TEST_OLLAMA_BASE_URL;

  try {
    const resolved = registry.resolveEnvironmentForRoute("ollama:model", "api-key", undefined);
    assert.equal(resolved.apiKey, "api-key");
    assert.equal(resolved.baseUrl, "http://localhost:11434/v1");
    assert.equal(
      resolved.warnings.some((warning) => /localhost/i.test(warning)),
      true,
    );
  } finally {
    if (previousBase === undefined) {
      delete process.env.TEST_OLLAMA_BASE_URL;
    } else {
      process.env.TEST_OLLAMA_BASE_URL = previousBase;
    }
  }
});

void test("ProviderRegistry does not warn for remote ollama base urls", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("ollama"),
    environmentPolicy: {
      apiKeyEnvs: ["TEST_OLLAMA_KEY"],
      baseUrlEnv: "TEST_OLLAMA_BASE_URL",
    },
  });

  const resolved = registry.resolveEnvironmentForRoute(
    "ollama:model",
    "api-key",
    "https://proxy.example.com",
  );
  assert.equal(resolved.apiKey, "api-key");
  assert.equal(resolved.baseUrl, "https://proxy.example.com");
  assert.equal(
    resolved.warnings.some((warning) => /localhost/i.test(warning)),
    false,
  );
});

void test("ProviderRegistry exposes sorted alias and fallback route snapshots", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider(createStaticProvider("alpha"));
  registry.registerProvider(createStaticProvider("beta"));

  registry.registerModelAlias("beta:z", "alpha:a");
  registry.registerModelAlias("alpha:m", "beta:n");

  registry.registerFallbackRoute("beta:z", ["alpha:a", "beta:n"]);

  assert.deepEqual(registry.listModelAliases(), [
    { alias: "alpha:m", target: "beta:n" },
    { alias: "beta:z", target: "alpha:a" },
  ]);

  assert.deepEqual(registry.listFallbackRoutes(), [
    { route: "beta:z", fallbackRoutes: ["alpha:a", "beta:n"] },
  ]);
});

void test("ProviderRegistry includes provider alias lifecycle metadata in snapshots", () => {
  const registry = new ProviderRegistry("alpha");
  registry.registerProvider({
    ...createStaticProvider("alpha"),
    aliases: {
      legacy: {
        target: "modern",
        lifecycle: {
          stage: "deprecated",
          replacement: "modern",
          deprecatedAfter: "2026-01-01",
        },
      },
    },
  });

  const aliases = registry.listModelAliases();
  assert.deepEqual(aliases, [
    {
      alias: "alpha:legacy",
      target: "alpha:modern",
      source: "provider",
      providerId: "alpha",
      lifecycleStage: "deprecated",
      deprecatedAfter: "2026-01-01",
      replacement: "modern",
    },
  ]);
});

void test("ProviderRegistry validates schema hook id and requiresRawOutput", () => {
  const registry = new ProviderRegistry("alpha");

  const missingId = {
    ...createStaticProvider("schema-a"),
    schemaHooks: {
      requiresRawOutput: true,
    },
  } as unknown as ProviderDefinition;

  assert.throws(() => registry.registerProvider(missingId), /schemaHooks\.id/i);

  const invalidRawOutput = {
    ...createStaticProvider("schema-b"),
    schemaHooks: {
      id: "schema-hooks",
      requiresRawOutput: "yes",
    },
  } as unknown as ProviderDefinition;

  assert.throws(
    () => registry.registerProvider(invalidRawOutput),
    /schemaHooks\.requiresRawOutput/i,
  );
});

void test("ProviderRegistry validates schema toProviderConfig shape", () => {
  const registry = new ProviderRegistry("alpha");

  const invalidToProviderConfig = {
    ...createStaticProvider("schema-c"),
    schemaHooks: {
      id: "schema-hooks",
      requiresRawOutput: false,
      toProviderConfig: "not-a-function",
    },
  } as unknown as ProviderDefinition;

  assert.throws(
    () => registry.registerProvider(invalidToProviderConfig),
    /schemaHooks\.toProviderConfig/i,
  );
});
