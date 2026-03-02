import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import {
  createBuiltinProviders,
  registerBuiltinProviders,
} from "../src/internal/providers/builtins.js";
import {
  createProviderRegistry,
  getProviderCapability,
  getProviderRoutingMetadata,
  getProviderSchemaHooks,
  listProviderCapabilities,
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

void test("createBuiltinProviders returns defensive copies", () => {
  const first = createBuiltinProviders();
  const second = createBuiltinProviders();

  const firstGateway = first.find((provider) => provider.id === "gateway");
  const secondGateway = second.find((provider) => provider.id === "gateway");

  assert.ok(firstGateway !== undefined);
  assert.ok(secondGateway !== undefined);

  if (firstGateway.aliases !== undefined) {
    firstGateway.aliases["google/gemini-3-flash"] = "mutated-route";
  }

  assert.notEqual(secondGateway.aliases?.["google/gemini-3-flash"], "mutated-route");

  const third = createBuiltinProviders();
  const fourth = createBuiltinProviders();
  const thirdGateway = third.find((provider) => provider.id === "gateway");
  const fourthGateway = fourth.find((provider) => provider.id === "gateway");
  assert.ok(thirdGateway !== undefined);
  assert.ok(fourthGateway !== undefined);

  const thirdAlias = thirdGateway.aliases?.["google/gemini-3-flash"];
  if (
    thirdAlias !== undefined &&
    typeof thirdAlias !== "string" &&
    thirdAlias.lifecycle !== undefined
  ) {
    thirdAlias.lifecycle.stage = "deprecated";
  }

  const fourthAlias = fourthGateway.aliases?.["google/gemini-3-flash"];
  if (fourthAlias !== undefined && typeof fourthAlias !== "string") {
    assert.notEqual(fourthAlias.lifecycle?.stage, "deprecated");
  }
});

void test("google builtin schema hook synthesizes JSON schema from examples", () => {
  const providers = createBuiltinProviders();
  const googleProvider = providers.find((provider) => provider.id === "google");

  assert.ok(googleProvider !== undefined);
  assert.ok(googleProvider.schemaHooks !== undefined);
  assert.equal(typeof googleProvider.schemaHooks.toProviderConfig, "function");
  const toProviderConfig = googleProvider.schemaHooks.toProviderConfig;
  assert.ok(toProviderConfig !== undefined);

  const config = toProviderConfig(
    [
      {
        text: "Alice moved to Berlin.",
        extractions: [
          {
            extractionClass: "person",
            extractionText: "Alice",
            attributes: {
              role: "engineer",
              tags: ["founder", "speaker"],
            },
          },
          {
            extractionClass: "location",
            extractionText: "Berlin",
          },
        ],
      },
    ],
    "_attrs",
  );

  const responseSchema = (config as Record<string, unknown>).responseSchema as Record<
    string,
    unknown
  >;
  const extractionsSchema = (responseSchema.properties as Record<string, unknown>)
    .extractions as Record<string, unknown>;
  const itemSchema = extractionsSchema.items as Record<string, unknown>;
  const properties = itemSchema.properties as Record<string, unknown>;
  const personAttrs = properties.person_attrs as Record<string, unknown>;
  const personAttrsProps = personAttrs.properties as Record<string, unknown>;
  const locationAttrs = properties.location_attrs as Record<string, unknown>;
  const locationAttrsProps = locationAttrs.properties as Record<string, unknown>;

  assert.equal((config as Record<string, unknown>).responseMimeType, "application/json");
  assert.equal((properties.person as Record<string, unknown>).type, "string");
  assert.equal((personAttrsProps.role as Record<string, unknown>).type, "string");
  assert.deepEqual(personAttrsProps.tags, { type: "array", items: { type: "string" } });
  assert.equal((locationAttrsProps._unused as Record<string, unknown>).type, "string");
});

void test("google builtin schema hook matches Python parity schema matrix", () => {
  const providers = createBuiltinProviders();
  const googleProvider = providers.find((provider) => provider.id === "google");
  assert.ok(googleProvider?.schemaHooks?.toProviderConfig !== undefined);
  const toProviderConfig = googleProvider.schemaHooks.toProviderConfig;

  const cases: Array<{
    name: string;
    examples: Array<{
      text: string;
      extractions: Array<{
        extractionClass: string;
        extractionText: string;
        attributes?: Record<string, unknown>;
      }>;
    }>;
    expectedSchema: Record<string, unknown>;
  }> = [
    {
      name: "empty_extractions",
      examples: [],
      expectedSchema: {
        type: "object",
        properties: {
          extractions: {
            type: "array",
            items: {
              type: "object",
              properties: {},
            },
          },
        },
        required: ["extractions"],
      },
    },
    {
      name: "single_extraction_no_attributes",
      examples: [
        {
          text: "Patient has diabetes.",
          extractions: [{ extractionClass: "condition", extractionText: "diabetes" }],
        },
      ],
      expectedSchema: {
        type: "object",
        properties: {
          extractions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                condition: { type: "string" },
                condition_attributes: {
                  type: "object",
                  properties: {
                    _unused: { type: "string" },
                  },
                  nullable: true,
                },
              },
            },
          },
        },
        required: ["extractions"],
      },
    },
    {
      name: "single_extraction",
      examples: [
        {
          text: "Patient has diabetes.",
          extractions: [
            {
              extractionClass: "condition",
              extractionText: "diabetes",
              attributes: { chronicity: "chronic" },
            },
          ],
        },
      ],
      expectedSchema: {
        type: "object",
        properties: {
          extractions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                condition: { type: "string" },
                condition_attributes: {
                  type: "object",
                  properties: {
                    chronicity: { type: "string" },
                  },
                  nullable: true,
                },
              },
            },
          },
        },
        required: ["extractions"],
      },
    },
    {
      name: "multiple_extraction_classes",
      examples: [
        {
          text: "Patient has diabetes.",
          extractions: [
            {
              extractionClass: "condition",
              extractionText: "diabetes",
              attributes: { chronicity: "chronic" },
            },
          ],
        },
        {
          text: "Patient is John Doe.",
          extractions: [
            {
              extractionClass: "patient",
              extractionText: "John Doe",
              attributes: { id: "12345" },
            },
          ],
        },
      ],
      expectedSchema: {
        type: "object",
        properties: {
          extractions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                condition: { type: "string" },
                condition_attributes: {
                  type: "object",
                  properties: {
                    chronicity: { type: "string" },
                  },
                  nullable: true,
                },
                patient: { type: "string" },
                patient_attributes: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                  },
                  nullable: true,
                },
              },
            },
          },
        },
        required: ["extractions"],
      },
    },
  ];

  for (const testCase of cases) {
    const config = toProviderConfig(testCase.examples, "_attributes");
    const responseMimeType = (config as Record<string, unknown>).responseMimeType;
    const responseSchema = (config as Record<string, unknown>).responseSchema;

    assert.equal(
      responseMimeType,
      "application/json",
      `${testCase.name}: expected responseMimeType`,
    );
    assert.deepEqual(responseSchema, testCase.expectedSchema, `${testCase.name}: schema mismatch`);
  }
});

void test("getProviderSchemaHooks returns hooks for builtins and undefined for unknown", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "gateway",
  });
  registerBuiltinProviders(registry);

  const googleHooks = getProviderSchemaHooks("google", registry);
  const missingHooks = getProviderSchemaHooks("missing", registry);

  assert.ok(googleHooks !== undefined);
  assert.equal(googleHooks.requiresRawOutput, true);
  assert.equal(missingHooks, undefined);
});

void test("provider capability snapshots include schema synthesis support", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "gateway",
  });
  registerBuiltinProviders(registry);

  const googleCapability = getProviderCapability("google", registry);
  assert.ok(googleCapability !== undefined);
  assert.equal(googleCapability.hasSchemaHooks, true);
  assert.equal(googleCapability.supportsSchemaSynthesis, true);
  assert.equal(googleCapability.requiresRawOutput, true);
  assert.equal(googleCapability.schemaHookId, "gemini");

  const openaiCapability = getProviderCapability("openai", registry);
  assert.ok(openaiCapability !== undefined);
  assert.equal(openaiCapability.hasSchemaHooks, false);
  assert.equal(openaiCapability.supportsSchemaSynthesis, false);
  assert.equal(openaiCapability.requiresRawOutput, false);

  const capabilities = listProviderCapabilities(registry);
  assert.equal(capabilities.length >= 3, true);
});

void test("provider capability marks non-synthesizing hooks correctly", () => {
  const registry = createProviderRegistry({ registerBuiltins: false, defaultProviderId: "alpha" });
  registry.registerProvider({
    ...createStaticProvider("schema-lite"),
    schemaHooks: {
      id: "schema-lite",
      requiresRawOutput: false,
    },
  });

  const capability = getProviderCapability("schema-lite", registry);
  assert.ok(capability !== undefined);
  assert.equal(capability.hasSchemaHooks, true);
  assert.equal(capability.supportsSchemaSynthesis, false);
  assert.equal(capability.requiresRawOutput, false);
});

void test("builtin routing metadata includes default gateway alias entry", () => {
  const registry = createProviderRegistry({
    registerBuiltins: false,
    defaultProviderId: "gateway",
  });
  registerBuiltinProviders(registry);

  const metadata = getProviderRoutingMetadata(registry);
  assert.equal(
    metadata.aliases.some(
      (entry) =>
        entry.alias === "gateway:google/gemini-3-flash" &&
        entry.target === "gateway:google/gemini-3-flash-preview",
    ),
    true,
  );
});
