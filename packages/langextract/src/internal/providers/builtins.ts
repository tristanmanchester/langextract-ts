import { gateway } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderAliasConfig, ProviderDefinition } from "./types.js";
import type { ProviderRegistry } from "./registry.js";
import { ATTRIBUTE_SUFFIX, EXTRACTIONS_KEY } from "../core/constants.js";

/**
 * Public default route policy: gateway with google/gemini-3-flash.
 * We keep the public default stable and handle preview-model churn via aliases.
 */
export const DEFAULT_PUBLIC_GATEWAY_MODEL_ID = "google/gemini-3-flash";

const BUILTIN_PROVIDER_PRESETS: readonly ProviderDefinition[] = [
  {
    id: "gateway",
    provider: gateway,
    defaultModelId: DEFAULT_PUBLIC_GATEWAY_MODEL_ID,
    modelIdPatterns: [
      "^google/",
      "^openai/",
      "^anthropic/",
      "^xai/",
      "^mistral/",
      "^meta-llama/",
      "^gemini",
      "^gpt",
    ],
    priority: 5,
    environmentPolicy: {
      apiKeyEnvs: ["AI_GATEWAY_API_KEY", "LANGEXTRACT_API_KEY"],
    },
    aliases: {
      "google/gemini-3-flash": {
        target: "google/gemini-3-flash-preview",
        lifecycle: {
          stage: "active",
          replacement: "google/gemini-3-flash-preview",
        },
      },
    },
    fallbackModelIds: {
      "google/gemini-3-flash": ["google/gemini-2.5-flash", "openai/gpt-4.1-mini"],
      "google/gemini-3-flash-preview": ["google/gemini-2.5-flash", "openai/gpt-4.1-mini"],
    },
  },
  {
    id: "google",
    provider: google,
    defaultModelId: "gemini-3-flash",
    modelIdPatterns: ["^gemini", "^google/gemini"],
    priority: 10,
    environmentPolicy: {
      apiKeyEnvs: ["GEMINI_API_KEY", "LANGEXTRACT_API_KEY"],
    },
    schemaHooks: {
      id: "gemini",
      requiresRawOutput: true,
      toProviderConfig(examples, attributeSuffix = ATTRIBUTE_SUFFIX) {
        const extractionProperties: Record<string, unknown> = {};
        for (const example of examples) {
          for (const extraction of example.extractions) {
            extractionProperties[extraction.extractionClass] = { type: "string" };
            extractionProperties[`${extraction.extractionClass}${attributeSuffix}`] = {
              type: "object",
              properties: toAttributeProperties(extraction.attributes),
              nullable: true,
            };
          }
        }

        return {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              [EXTRACTIONS_KEY]: {
                type: "array",
                items: {
                  type: "object",
                  properties: extractionProperties,
                },
              },
            },
            required: [EXTRACTIONS_KEY],
          },
        };
      },
    },
    aliases: {
      "gemini-3-flash": {
        target: "gemini-3-flash-preview",
        lifecycle: {
          stage: "active",
          replacement: "gemini-3-flash-preview",
        },
      },
    },
    fallbackModelIds: {
      "gemini-3-flash": ["gemini-2.5-flash"],
      "gemini-3-flash-preview": ["gemini-2.5-flash"],
    },
  },
  {
    id: "openai",
    provider: openai,
    defaultModelId: "gpt-4.1-mini",
    modelIdPatterns: ["^gpt-4", "^gpt4\\.", "^gpt-5", "^gpt5\\.", "^openai/"],
    priority: 10,
    environmentPolicy: {
      apiKeyEnvs: ["OPENAI_API_KEY", "LANGEXTRACT_API_KEY"],
    },
  },
  {
    id: "ollama",
    provider: createOpenAICompatible({
      name: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434/v1",
      ...(process.env.OLLAMA_API_KEY !== undefined ? { apiKey: process.env.OLLAMA_API_KEY } : {}),
      supportsStructuredOutputs: false,
    }),
    defaultModelId: "llama3.2",
    modelIdPatterns: ["^ollama/", "^llama", "^qwen", "^phi", "^mistral"],
    priority: 3,
    environmentPolicy: {
      apiKeyEnvs: ["OLLAMA_API_KEY", "LANGEXTRACT_API_KEY"],
      baseUrlEnv: "OLLAMA_BASE_URL",
    },
  },
];

function toAttributeProperties(
  attributes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (attributes === undefined) {
    return { _unused: { type: "string" } };
  }

  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (Array.isArray(value)) {
      properties[key] = {
        type: "array",
        items: { type: "string" },
      };
      continue;
    }

    properties[key] = { type: "string" };
  }

  if (Object.keys(properties).length === 0) {
    properties._unused = { type: "string" };
  }
  return properties;
}

export function createBuiltinProviders(): ProviderDefinition[] {
  return BUILTIN_PROVIDER_PRESETS.map((preset) => ({
    ...preset,
    ...(preset.aliases !== undefined ? { aliases: cloneAliasConfigMap(preset.aliases) } : {}),
    ...(preset.fallbackModelIds !== undefined
      ? {
          fallbackModelIds: Object.fromEntries(
            Object.entries(preset.fallbackModelIds).map(([key, value]) => [key, [...value]]),
          ),
        }
      : {}),
  }));
}

function cloneAliasConfigMap(
  aliases: Record<string, ProviderAliasConfig>,
): Record<string, ProviderAliasConfig> {
  return Object.fromEntries(
    Object.entries(aliases).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value];
      }

      return [
        key,
        {
          target: value.target,
          ...(value.lifecycle !== undefined ? { lifecycle: { ...value.lifecycle } } : {}),
        },
      ];
    }),
  );
}

export function registerBuiltinProviders(registry: ProviderRegistry): void {
  for (const provider of createBuiltinProviders()) {
    registry.registerProvider(provider);
  }
}
