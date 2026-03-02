import {
  DEFAULT_PUBLIC_GATEWAY_MODEL_ID,
  ProviderRegistry,
  loadProviderPlugins as loadProviderPluginsInternal,
  registerBuiltinProviders,
  registerProviderPlugin as registerProviderPluginInternal,
  type ProviderAliasLifecyclePolicy,
  type ProviderDefinition,
  type ProviderPluginLoadResult,
  type ProviderPluginRegistration,
  type ResolvedProviderEnvironment,
  type ResolveModelOptions,
} from "../internal/providers/index.js";
import type { ProviderCapabilityInfo, ProviderRoutingMetadata } from "./types.js";

export type { ProviderCapabilityInfo, ProviderRoutingMetadata };

export interface CreateProviderRegistryOptions {
  defaultProviderId?: string;
  registerBuiltins?: boolean;
}

export interface LoadProviderPluginsOptions {
  registry?: ProviderRegistry;
  cwd?: string;
  packageJsonPath?: string;
  includeDevDependencies?: boolean;
}

export interface LoadProviderPluginsOnceOptions extends LoadProviderPluginsOptions {
  forceReload?: boolean;
}

let pluginLoadPromise: Promise<ProviderPluginLoadResult> | null = null;

const defaultRegistry = createProviderRegistry({
  defaultProviderId: "gateway",
  registerBuiltins: true,
});

export function createProviderRegistry(
  options: CreateProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = new ProviderRegistry(options.defaultProviderId ?? "gateway");
  if (options.registerBuiltins ?? true) {
    registerBuiltinProviders(registry);
  }

  return registry;
}

export function getDefaultProviderRegistry(): ProviderRegistry {
  return defaultRegistry;
}

export function registerProvider(provider: ProviderDefinition, registry = defaultRegistry): void {
  registry.registerProvider(provider);
}

export function registerModelAlias(
  alias: string,
  target: string,
  registry?: ProviderRegistry,
): void;
export function registerModelAlias(
  alias: string,
  target: string,
  lifecycle: ProviderAliasLifecyclePolicy,
  registry?: ProviderRegistry,
): void;
export function registerModelAlias(
  alias: string,
  target: string,
  lifecycleOrRegistry?: ProviderAliasLifecyclePolicy | ProviderRegistry,
  registry = defaultRegistry,
): void {
  if (lifecycleOrRegistry instanceof ProviderRegistry) {
    lifecycleOrRegistry.registerModelAlias(alias, target);
    return;
  }

  registry.registerModelAlias(alias, target, lifecycleOrRegistry);
}

export function registerFallbackRoute(
  route: string,
  fallbackRoutes: readonly string[],
  registry = defaultRegistry,
): void {
  registry.registerFallbackRoute(route, fallbackRoutes);
}

export function registerProviderRoutePattern(
  providerId: string,
  pattern: string | RegExp,
  priority?: number,
  registry = defaultRegistry,
): void {
  registry.registerProviderRoutePattern(providerId, pattern, priority);
}

export function resolveModel(options: ResolveModelOptions, registry = defaultRegistry) {
  return registry.resolveModel(options);
}

export async function registerProviderPlugin(
  plugin: ProviderPluginRegistration,
  registry = defaultRegistry,
): Promise<string> {
  return registerProviderPluginInternal(plugin, registry);
}

export async function loadProviderPlugins(
  options: LoadProviderPluginsOptions = {},
): Promise<ProviderPluginLoadResult> {
  if (process.env.LANGEXTRACT_DISABLE_PLUGINS === "1") {
    return {
      loaded: [],
      failed: [],
    };
  }

  return loadProviderPluginsInternal({
    registry: options.registry ?? defaultRegistry,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.packageJsonPath !== undefined ? { packageJsonPath: options.packageJsonPath } : {}),
    ...(options.includeDevDependencies !== undefined
      ? { includeDevDependencies: options.includeDevDependencies }
      : {}),
  });
}

export async function loadProviderPluginsOnce(
  options: LoadProviderPluginsOnceOptions = {},
): Promise<ProviderPluginLoadResult> {
  if (options.forceReload === true) {
    pluginLoadPromise = null;
  }

  if (pluginLoadPromise === null) {
    pluginLoadPromise = loadProviderPlugins(options);
  }

  return pluginLoadPromise;
}

export function resolveProviderEnvironment(
  modelId: string,
  explicitApiKey?: string,
  explicitBaseUrl?: string,
  registry = defaultRegistry,
): ResolvedProviderEnvironment {
  return registry.resolveEnvironmentForRoute(modelId, explicitApiKey, explicitBaseUrl);
}

export function getProviderSchemaHooks(providerId: string, registry = defaultRegistry) {
  const provider = registry.getProvider(providerId);
  return provider?.schemaHooks;
}

export function getProviderRoutingMetadata(registry = defaultRegistry): ProviderRoutingMetadata {
  return {
    defaultProviderId: registry.getDefaultProviderId(),
    providers: registry.listProviders().map((provider) => provider.id),
    routePatterns: registry.listProviderRoutePatterns().map((entry) => ({
      providerId: entry.providerId,
      pattern: entry.pattern.source,
      flags: entry.pattern.flags,
      priority: entry.priority,
    })),
    aliases: registry.listModelAliases(),
    fallbackRoutes: registry.listFallbackRoutes(),
  };
}

export function getProviderCapability(
  providerId: string,
  registry = defaultRegistry,
): ProviderCapabilityInfo | undefined {
  return registry.getProviderCapabilities(providerId);
}

export function listProviderCapabilities(registry = defaultRegistry): ProviderCapabilityInfo[] {
  return registry
    .listProviders()
    .map((provider) => registry.getProviderCapabilities(provider.id))
    .filter((capability): capability is ProviderCapabilityInfo => capability !== undefined);
}

export { DEFAULT_PUBLIC_GATEWAY_MODEL_ID, ProviderRegistry };

export type {
  AISDKModelSettings,
  LangextractModel,
  ModelCandidate,
  ProviderAliasConfig,
  ProviderAliasLifecyclePolicy,
  ProviderAliasLifecycleStage,
  LoadedProviderPlugin,
  ProviderDefinition,
  ProviderEnvironmentPolicy,
  ProviderPluginLoadFailure,
  ProviderPluginRegistration,
  ProviderRegistryLike,
  ProviderSchemaHooks,
  ResolvedProviderEnvironment,
  ResolveModelOptions,
} from "../internal/providers/index.js";
