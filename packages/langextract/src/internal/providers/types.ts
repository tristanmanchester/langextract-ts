import type { LanguageModel } from "ai";

export interface AISDKModelSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: readonly string[];
  seed?: number;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface ModelCandidate {
  provider: string;
  modelId: string;
  model: LanguageModel;
}

export interface LangextractModel extends ModelCandidate {
  fallbackModels: readonly ModelCandidate[];
  routingWarnings?: readonly string[];
}

export type ProviderAliasLifecycleStage = "active" | "deprecated" | "sunset" | "removed";

export interface ProviderAliasLifecyclePolicy {
  stage?: ProviderAliasLifecycleStage;
  deprecatedAfter?: string;
  sunsetAfter?: string;
  removedAfter?: string;
  replacement?: string;
  message?: string;
}

export type ProviderAliasConfig =
  | string
  | {
      target: string;
      lifecycle?: ProviderAliasLifecyclePolicy;
    };

export interface ProviderSchemaHooks {
  readonly id: string;
  readonly requiresRawOutput: boolean;
  toProviderConfig?(
    examples: readonly {
      text: string;
      extractions: readonly {
        extractionClass: string;
        extractionText: string;
        attributes?: Record<string, unknown>;
      }[];
    }[],
    attributeSuffix: string,
  ): Record<string, unknown>;
}

export interface ProviderEnvironmentPolicy {
  apiKeyEnvs?: readonly string[];
  baseUrlEnv?: string;
}

export interface ProviderDefinition {
  id: string;
  provider: unknown;
  defaultModelId: string;
  aliases?: Record<string, ProviderAliasConfig>;
  fallbackModelIds?: Record<string, readonly string[]>;
  modelIdPatterns?: readonly (string | RegExp)[];
  priority?: number;
  environmentPolicy?: ProviderEnvironmentPolicy;
  schemaHooks?: ProviderSchemaHooks;
}

export interface ProviderRoutePatternSnapshot {
  providerId: string;
  pattern: RegExp;
  priority: number;
}

export interface ProviderAliasSnapshot {
  alias: string;
  target: string;
  source?: "registry" | "provider";
  providerId?: string;
  lifecycleStage?: ProviderAliasLifecycleStage;
  deprecatedAfter?: string;
  sunsetAfter?: string;
  removedAfter?: string;
  replacement?: string;
}

export interface ProviderFallbackRouteSnapshot {
  route: string;
  fallbackRoutes: readonly string[];
}

export interface ProviderCapabilitiesSnapshot {
  providerId: string;
  hasSchemaHooks: boolean;
  supportsSchemaSynthesis: boolean;
  requiresRawOutput: boolean;
  schemaHookId?: string;
}

export interface ResolveModelOptions {
  model?: LanguageModel | LangextractModel;
  provider?: string;
  modelId?: string;
  settings?: AISDKModelSettings;
}

export interface ResolvedProviderEnvironment {
  apiKey?: string;
  baseUrl?: string;
  warnings: string[];
}

export type ProviderPluginRegistration =
  | {
      name?: string;
      register(registry: ProviderRegistryLike): void | Promise<void>;
    }
  | ((registry: ProviderRegistryLike) => void | Promise<void>);

export interface ProviderRegistryLike {
  registerProvider(provider: ProviderDefinition): void;
  registerModelAlias(alias: string, target: string, lifecycle?: ProviderAliasLifecyclePolicy): void;
  registerFallbackRoute(route: string, fallbackRoutes: readonly string[]): void;
  registerProviderRoutePattern(
    providerId: string,
    pattern: string | RegExp,
    priority?: number,
  ): void;
}

export interface LoadedProviderPlugin {
  packageName: string;
  pluginName: string;
  entryPath: string;
}

export interface ProviderPluginLoadFailure {
  packageName: string;
  reason: string;
}

export interface ProviderPluginLoadResult {
  loaded: LoadedProviderPlugin[];
  failed: ProviderPluginLoadFailure[];
}
