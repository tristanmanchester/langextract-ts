import { createProviderRegistry as createAISDKProviderRegistry } from "ai";
import type {
  ProviderAliasConfig,
  ProviderAliasLifecyclePolicy,
  ProviderAliasLifecycleStage,
  LangextractModel,
  ModelCandidate,
  ProviderAliasSnapshot,
  ProviderCapabilitiesSnapshot,
  ProviderDefinition,
  ProviderFallbackRouteSnapshot,
  ProviderRoutePatternSnapshot,
  ProviderRegistryLike,
  ResolvedProviderEnvironment,
  ResolveModelOptions,
} from "./types.js";

interface ProviderRoute {
  providerId: string;
  modelId?: string;
}

interface ProviderRouteWithModel {
  providerId: string;
  modelId: string;
}

interface ProviderPatternEntry {
  providerId: string;
  priority: number;
  pattern: RegExp;
}

interface RegisteredAliasEntry {
  target: string;
  lifecycle?: ProviderAliasLifecyclePolicy;
}

interface NormalizedAliasEntry {
  alias: string;
  target: string;
  source: "registry" | "provider";
  providerId?: string;
  lifecycle?: ProviderAliasLifecyclePolicy;
}

interface AliasResolutionResult {
  route: ProviderRouteWithModel;
  warnings: string[];
}

const PROVIDER_PREFIX_PATTERN = /^([a-z0-9_-]+):(.*)$/i;
const MAX_ALIAS_DEPTH = 16;
const DEFAULT_PATTERN_PRIORITY = 0;
const ALLOW_SUNSET_ALIAS_ENV = "LANGEXTRACT_ALLOW_SUNSET_ALIASES";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

export class ProviderRegistry implements ProviderRegistryLike {
  private readonly providers = new Map<string, ProviderDefinition>();
  private readonly modelAliases = new Map<string, RegisteredAliasEntry>();
  private readonly fallbackRoutes = new Map<string, readonly string[]>();
  private readonly providerPatterns: ProviderPatternEntry[] = [];
  private defaultProviderId: string;
  private providerRegistryCache: ReturnType<typeof createAISDKProviderRegistry> | null = null;

  public constructor(defaultProviderId = "gateway") {
    this.defaultProviderId = defaultProviderId;
  }

  public registerProvider(provider: ProviderDefinition): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered.`);
    }
    assertProviderSchemaHooks(provider);

    this.providers.set(provider.id, provider);
    const patterns = provider.modelIdPatterns ?? [];
    for (const pattern of patterns) {
      this.registerProviderRoutePattern(provider.id, pattern, provider.priority);
    }
    this.providerRegistryCache = null;
  }

  public registerProviderRoutePattern(
    providerId: string,
    pattern: string | RegExp,
    priority = DEFAULT_PATTERN_PRIORITY,
  ): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider "${providerId}" is not registered.`);
    }

    const compiled = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
    this.providerPatterns.push({
      providerId,
      pattern: compiled,
      priority,
    });
  }

  public registerModelAlias(
    alias: string,
    target: string,
    lifecycle?: ProviderAliasLifecyclePolicy,
  ): void {
    const normalizedAlias = this.requireRouteModel(
      this.parseRouteIdentifier(alias, this.defaultProviderId),
    );
    const normalizedTarget = this.requireRouteModel(
      this.parseRouteIdentifier(target, this.defaultProviderId),
    );

    this.modelAliases.set(toRouteKey(normalizedAlias.providerId, normalizedAlias.modelId), {
      target: toRouteKey(normalizedTarget.providerId, normalizedTarget.modelId),
      ...(lifecycle !== undefined ? { lifecycle } : {}),
    });
  }

  public registerFallbackRoute(route: string, fallbackRoutes: readonly string[]): void {
    const normalizedRoute = this.requireRouteModel(
      this.parseRouteIdentifier(route, this.defaultProviderId),
    );

    this.fallbackRoutes.set(
      toRouteKey(normalizedRoute.providerId, normalizedRoute.modelId),
      fallbackRoutes.map((item) => item.trim()).filter((item) => item.length > 0),
    );
  }

  public hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  public getProvider(providerId: string): ProviderDefinition | undefined {
    return this.providers.get(providerId);
  }

  public listProviders(): ProviderDefinition[] {
    return Array.from(this.providers.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  public listProviderRoutePatterns(): ReadonlyArray<ProviderRoutePatternSnapshot> {
    return [...this.providerPatterns].sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      if (a.providerId !== b.providerId) {
        return a.providerId.localeCompare(b.providerId);
      }

      return a.pattern.source.localeCompare(b.pattern.source);
    });
  }

  public listModelAliases(): ReadonlyArray<ProviderAliasSnapshot> {
    return this.collectNormalizedAliases()
      .map((entry) => {
        const stage = resolveAliasLifecycleStage(entry.lifecycle);
        return {
          alias: entry.alias,
          target: entry.target,
          ...(entry.source !== "registry" ? { source: entry.source } : {}),
          ...(entry.providerId !== undefined ? { providerId: entry.providerId } : {}),
          ...(stage !== "active" ? { lifecycleStage: stage } : {}),
          ...(entry.lifecycle?.deprecatedAfter !== undefined
            ? { deprecatedAfter: entry.lifecycle.deprecatedAfter }
            : {}),
          ...(entry.lifecycle?.sunsetAfter !== undefined
            ? { sunsetAfter: entry.lifecycle.sunsetAfter }
            : {}),
          ...(entry.lifecycle?.removedAfter !== undefined
            ? { removedAfter: entry.lifecycle.removedAfter }
            : {}),
          ...(entry.lifecycle?.replacement !== undefined
            ? { replacement: entry.lifecycle.replacement }
            : {}),
        };
      })
      .sort((a, b) => a.alias.localeCompare(b.alias));
  }

  public listFallbackRoutes(): ReadonlyArray<ProviderFallbackRouteSnapshot> {
    return Array.from(this.fallbackRoutes.entries())
      .map(([route, fallbackRoutes]) => ({
        route,
        fallbackRoutes,
      }))
      .sort((a, b) => a.route.localeCompare(b.route));
  }

  public getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  public getProviderCapabilities(providerId: string): ProviderCapabilitiesSnapshot | undefined {
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      return undefined;
    }

    const schemaHooks = provider.schemaHooks;

    return {
      providerId,
      hasSchemaHooks: schemaHooks !== undefined,
      supportsSchemaSynthesis: typeof schemaHooks?.toProviderConfig === "function",
      requiresRawOutput: schemaHooks?.requiresRawOutput ?? false,
      ...(schemaHooks?.id !== undefined ? { schemaHookId: schemaHooks.id } : {}),
    };
  }

  public setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Cannot set unknown provider "${providerId}" as default.`);
    }

    this.defaultProviderId = providerId;
  }

  public resolveModel(options: ResolveModelOptions = {}): LangextractModel {
    if (options.model !== undefined) {
      return this.normalizeExplicitModel(options.model, options.provider, options.modelId);
    }

    const route = this.resolveRoute(options.provider, options.modelId);
    const canonical = this.resolveCanonicalRoute(route);
    const primary = this.instantiateModelCandidate(canonical.route);

    const fallbackModels = this.resolveFallbackRoutes(canonical.route)
      .map((fallbackRoute) => this.instantiateModelCandidate(fallbackRoute))
      .filter(
        (candidate) =>
          toRouteKey(candidate.provider, candidate.modelId) !==
          toRouteKey(primary.provider, primary.modelId),
      );

    return {
      ...primary,
      fallbackModels,
      ...(canonical.warnings.length > 0 ? { routingWarnings: canonical.warnings } : {}),
    };
  }

  private normalizeExplicitModel(
    explicitModel: ResolveModelOptions["model"],
    provider: string | undefined,
    modelId: string | undefined,
  ): LangextractModel {
    if (explicitModel === undefined) {
      throw new Error("Explicit model must be defined.");
    }

    if (isLangextractModel(explicitModel)) {
      return explicitModel;
    }

    return {
      provider: provider?.trim() || "custom",
      modelId: modelId?.trim() || "custom-model",
      model: explicitModel,
      fallbackModels: [],
    };
  }

  private resolveFallbackRoutes(route: ProviderRouteWithModel): ProviderRouteWithModel[] {
    const provider = this.providers.get(route.providerId);
    if (provider === undefined) {
      throw new Error(`Provider "${route.providerId}" is not registered.`);
    }

    const providerFallbacks = provider.fallbackModelIds?.[route.modelId] ?? [];
    const globalFallbacks =
      this.fallbackRoutes.get(toRouteKey(route.providerId, route.modelId)) ?? [];
    const allFallbacks = [...providerFallbacks, ...globalFallbacks];

    const results: ProviderRouteWithModel[] = [];
    const seen = new Set<string>();

    for (const fallback of allFallbacks) {
      const parsed = this.parseRouteIdentifier(fallback, route.providerId);
      const canonical = this.resolveCanonicalRoute(parsed);
      const key = toRouteKey(canonical.route.providerId, canonical.route.modelId);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(canonical.route);
    }

    return results;
  }

  private instantiateModelCandidate(route: ProviderRouteWithModel): ModelCandidate {
    const registry = this.getAiProviderRegistry();
    const model = registry.languageModel(`${route.providerId}:${route.modelId}`);

    return {
      provider: route.providerId,
      modelId: route.modelId,
      model,
    };
  }

  private getAiProviderRegistry(): ReturnType<typeof createAISDKProviderRegistry> {
    if (this.providerRegistryCache !== null) {
      return this.providerRegistryCache;
    }

    const providerEntries = Array.from(this.providers.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const providers: Record<string, unknown> = {};
    for (const entry of providerEntries) {
      providers[entry.id] = entry.provider;
    }

    this.providerRegistryCache = createAISDKProviderRegistry(providers as never);
    return this.providerRegistryCache;
  }

  private resolveCanonicalRoute(route: ProviderRoute): AliasResolutionResult {
    let currentRoute = this.requireRouteModel(route);
    const warnings: string[] = [];
    const seen = new Set<string>();

    for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth += 1) {
      const key = toRouteKey(currentRoute.providerId, currentRoute.modelId);
      if (seen.has(key)) {
        throw new Error(`Model alias cycle detected at "${key}".`);
      }

      seen.add(key);

      const aliasEntry = this.lookupAliasEntry(currentRoute);
      if (aliasEntry === undefined) {
        return {
          route: currentRoute,
          warnings,
        };
      }

      const stage = resolveAliasLifecycleStage(aliasEntry.lifecycle);
      this.assertAliasStageAllowed(
        aliasEntry.alias,
        aliasEntry.target,
        stage,
        aliasEntry.lifecycle,
      );

      const warning = buildAliasLifecycleWarning(aliasEntry.alias, aliasEntry.target, stage);
      if (warning !== undefined) {
        warnings.push(warning);
      }

      currentRoute = this.requireRouteModel(
        this.parseRouteIdentifier(aliasEntry.target, currentRoute.providerId),
      );
    }

    throw new Error(`Model alias depth exceeded ${MAX_ALIAS_DEPTH} while resolving route.`);
  }

  private lookupAliasEntry(route: ProviderRouteWithModel): NormalizedAliasEntry | undefined {
    const routeKey = toRouteKey(route.providerId, route.modelId);
    const globalAlias = this.modelAliases.get(routeKey);
    if (globalAlias !== undefined) {
      return {
        alias: routeKey,
        target: globalAlias.target,
        source: "registry",
        ...(globalAlias.lifecycle !== undefined ? { lifecycle: globalAlias.lifecycle } : {}),
      };
    }

    const provider = this.providers.get(route.providerId);
    if (provider === undefined) {
      throw new Error(`Provider "${route.providerId}" is not registered.`);
    }

    const providerAliasConfig = provider.aliases?.[route.modelId];
    if (providerAliasConfig === undefined) {
      return undefined;
    }

    const parsedAliasConfig = normalizeAliasConfig(providerAliasConfig);
    const normalizedAlias = this.requireRouteModel(
      this.parseRouteIdentifier(route.modelId, route.providerId),
    );
    const normalizedTarget = this.requireRouteModel(
      this.parseRouteIdentifier(parsedAliasConfig.target, route.providerId),
    );

    return {
      alias: toRouteKey(normalizedAlias.providerId, normalizedAlias.modelId),
      target: toRouteKey(normalizedTarget.providerId, normalizedTarget.modelId),
      source: "provider",
      providerId: provider.id,
      ...(parsedAliasConfig.lifecycle !== undefined
        ? { lifecycle: parsedAliasConfig.lifecycle }
        : {}),
    };
  }

  private collectNormalizedAliases(): NormalizedAliasEntry[] {
    const aliases: NormalizedAliasEntry[] = [];

    for (const [alias, entry] of this.modelAliases.entries()) {
      aliases.push({
        alias,
        target: entry.target,
        source: "registry",
        ...(entry.lifecycle !== undefined ? { lifecycle: entry.lifecycle } : {}),
      });
    }

    for (const provider of this.providers.values()) {
      const providerAliases = provider.aliases ?? {};
      for (const [alias, config] of Object.entries(providerAliases)) {
        const normalizedAlias = this.requireRouteModel(
          this.parseRouteIdentifier(alias, provider.id),
        );
        const normalizedConfig = normalizeAliasConfig(config);
        const normalizedTarget = this.requireRouteModel(
          this.parseRouteIdentifier(normalizedConfig.target, provider.id),
        );

        aliases.push({
          alias: toRouteKey(normalizedAlias.providerId, normalizedAlias.modelId),
          target: toRouteKey(normalizedTarget.providerId, normalizedTarget.modelId),
          source: "provider",
          providerId: provider.id,
          ...(normalizedConfig.lifecycle !== undefined
            ? { lifecycle: normalizedConfig.lifecycle }
            : {}),
        });
      }
    }

    return aliases;
  }

  private assertAliasStageAllowed(
    alias: string,
    target: string,
    stage: ProviderAliasLifecycleStage,
    lifecycle: ProviderAliasLifecyclePolicy | undefined,
  ): void {
    if (stage === "active" || stage === "deprecated") {
      return;
    }

    const replacement = lifecycle?.replacement ?? target;
    if (stage === "removed") {
      throw new Error(`Model alias "${alias}" has been removed. Use "${replacement}" instead.`);
    }

    const allowSunset = toBooleanEnv(process.env[ALLOW_SUNSET_ALIAS_ENV]);
    if (allowSunset) {
      return;
    }

    throw new Error(
      `Model alias "${alias}" is in sunset stage. Use "${replacement}" instead, or set ${ALLOW_SUNSET_ALIAS_ENV}=1 for temporary override.`,
    );
  }

  private resolveRoute(
    explicitProvider: string | undefined,
    modelId: string | undefined,
  ): ProviderRoute {
    if (typeof explicitProvider === "string" && explicitProvider.length > 0) {
      if (typeof modelId === "string" && modelId.length > 0) {
        const parsed = parsePrefixedModelId(modelId);
        if (parsed !== null && parsed.providerId === explicitProvider) {
          return parsed;
        }

        return {
          providerId: explicitProvider,
          modelId,
        };
      }

      return {
        providerId: explicitProvider,
      };
    }

    if (typeof modelId === "string" && modelId.length > 0) {
      const parsed = parsePrefixedModelId(modelId);
      if (parsed !== null) {
        return parsed;
      }

      const routedProviderId = this.resolveProviderIdByPattern(modelId);
      if (routedProviderId !== null) {
        return {
          providerId: routedProviderId,
          modelId,
        };
      }

      return {
        providerId: this.defaultProviderId,
        modelId,
      };
    }

    return {
      providerId: this.defaultProviderId,
    };
  }

  private parseRouteIdentifier(identifier: string, defaultProviderId: string): ProviderRoute {
    const trimmed = identifier.trim();
    if (trimmed.length === 0) {
      throw new Error("Route identifier cannot be empty.");
    }

    const parsed = parsePrefixedModelId(trimmed);
    if (parsed !== null) {
      return parsed;
    }

    return {
      providerId: defaultProviderId,
      modelId: trimmed,
    };
  }

  private requireRouteModel(route: ProviderRoute): ProviderRouteWithModel {
    const provider = this.providers.get(route.providerId);
    if (provider === undefined) {
      throw new Error(`Provider "${route.providerId}" is not registered.`);
    }

    return {
      providerId: route.providerId,
      modelId: route.modelId ?? provider.defaultModelId,
    };
  }

  private resolveProviderIdByPattern(modelId: string): string | null {
    if (modelId.trim().length === 0) {
      return null;
    }

    const candidates = this.providerPatterns
      .filter((entry) => entry.pattern.test(modelId))
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }

        return a.providerId.localeCompare(b.providerId);
      });
    const first = candidates[0];
    return first?.providerId ?? null;
  }

  public resolveEnvironmentForRoute(
    routeModelId: string,
    explicitApiKey: string | undefined,
    explicitBaseUrl: string | undefined,
  ): ResolvedProviderEnvironment {
    const providerId =
      parsePrefixedModelId(routeModelId)?.providerId ??
      this.resolveProviderIdByPattern(routeModelId) ??
      this.defaultProviderId;
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      return {
        ...(explicitApiKey !== undefined ? { apiKey: explicitApiKey } : {}),
        ...(explicitBaseUrl !== undefined ? { baseUrl: explicitBaseUrl } : {}),
        warnings: [],
      };
    }

    const warnings: string[] = [];
    const environmentPolicy = provider.environmentPolicy;
    const apiKeyEnvs = environmentPolicy?.apiKeyEnvs ?? [];
    const envHits: Array<{ key: string; value: string }> = [];

    for (const envKey of apiKeyEnvs) {
      const value = process.env[envKey];
      if (typeof value === "string" && value.length > 0) {
        envHits.push({ key: envKey, value });
      }
    }

    if (envHits.length > 1) {
      warnings.push(
        `Multiple API keys detected in environment for provider "${providerId}": ${envHits
          .map((item) => item.key)
          .join(", ")}. Using ${envHits[0]?.key}.`,
      );
    }

    const envApiKey = envHits[0]?.value;
    const envBaseUrlKey = environmentPolicy?.baseUrlEnv;
    const envBaseUrl =
      envBaseUrlKey !== undefined &&
      typeof process.env[envBaseUrlKey] === "string" &&
      process.env[envBaseUrlKey] !== ""
        ? process.env[envBaseUrlKey]
        : undefined;

    const resolvedApiKey = explicitApiKey ?? envApiKey;
    const resolvedBaseUrl =
      explicitBaseUrl ??
      envBaseUrl ??
      (providerId === "ollama" ? DEFAULT_OLLAMA_BASE_URL : undefined);

    if (
      providerId === "ollama" &&
      resolvedApiKey !== undefined &&
      resolvedBaseUrl !== undefined &&
      isLocalhostUrl(resolvedBaseUrl)
    ) {
      warnings.push(
        `Provider "ollama" is configured with a localhost URL (${resolvedBaseUrl}) and an API key. Local Ollama usually does not require authentication, but the key will still be forwarded.`,
      );
    }

    return {
      ...(resolvedApiKey !== undefined ? { apiKey: resolvedApiKey } : {}),
      ...(resolvedBaseUrl !== undefined ? { baseUrl: resolvedBaseUrl } : {}),
      warnings,
    };
  }
}

function assertProviderSchemaHooks(provider: ProviderDefinition): void {
  const hooks = provider.schemaHooks;
  if (hooks === undefined) {
    return;
  }

  if (typeof hooks.id !== "string" || hooks.id.trim().length === 0) {
    throw new Error(`Provider "${provider.id}" schemaHooks.id must be a non-empty string.`);
  }

  if (typeof hooks.requiresRawOutput !== "boolean") {
    throw new Error(`Provider "${provider.id}" schemaHooks.requiresRawOutput must be a boolean.`);
  }

  if (hooks.toProviderConfig !== undefined && typeof hooks.toProviderConfig !== "function") {
    throw new Error(
      `Provider "${provider.id}" schemaHooks.toProviderConfig must be a function when provided.`,
    );
  }
}

function normalizeAliasConfig(config: ProviderAliasConfig): {
  target: string;
  lifecycle?: ProviderAliasLifecyclePolicy;
} {
  if (typeof config === "string") {
    return { target: config };
  }

  return {
    target: config.target,
    ...(config.lifecycle !== undefined ? { lifecycle: { ...config.lifecycle } } : {}),
  };
}

function resolveAliasLifecycleStage(
  lifecycle: ProviderAliasLifecyclePolicy | undefined,
): ProviderAliasLifecycleStage {
  if (lifecycle === undefined) {
    return "active";
  }

  const now = Date.now();
  const removedAt = parseDateMillis(lifecycle.removedAfter);
  if (removedAt !== null && now >= removedAt) {
    return "removed";
  }

  const sunsetAt = parseDateMillis(lifecycle.sunsetAfter);
  if (sunsetAt !== null && now >= sunsetAt) {
    return "sunset";
  }

  const deprecatedAt = parseDateMillis(lifecycle.deprecatedAfter);
  if (deprecatedAt !== null && now >= deprecatedAt) {
    return "deprecated";
  }

  return lifecycle.stage ?? "active";
}

function buildAliasLifecycleWarning(
  alias: string,
  target: string,
  stage: ProviderAliasLifecycleStage,
): string | undefined {
  if (stage === "active" || stage === "removed") {
    return undefined;
  }

  if (stage === "deprecated") {
    return `Model alias "${alias}" is deprecated and currently resolves to "${target}".`;
  }

  return `Model alias "${alias}" is in sunset stage and currently resolves to "${target}".`;
}

function parseDateMillis(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanEnv(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toRouteKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function parsePrefixedModelId(modelId: string): ProviderRoute | null {
  const match = PROVIDER_PREFIX_PATTERN.exec(modelId.trim());
  if (match === null) {
    return null;
  }

  const providerId = match[1]?.trim();
  const routedModelId = match[2]?.trim();
  if (
    providerId === undefined ||
    providerId.length === 0 ||
    routedModelId === undefined ||
    routedModelId.length === 0
  ) {
    return null;
  }

  return {
    providerId,
    modelId: routedModelId,
  };
}

function isLangextractModel(value: unknown): value is LangextractModel {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.provider === "string" &&
    typeof record.modelId === "string" &&
    "model" in record &&
    Array.isArray(record.fallbackModels)
  );
}

function isLocalhostUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const normalizedHost = host.replace(/^\[(.*)\]$/u, "$1");
    return (
      normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost === "::1"
    );
  } catch {
    // Accept host:port inputs without protocol.
    const normalized = trimmed
      .replace(/^\[::1\](?::\d+)?\/?$/i, "::1")
      .replace(/^127\.0\.0\.1(?::\d+)?\/?$/i, "127.0.0.1")
      .replace(/^localhost(?::\d+)?\/?$/i, "localhost");
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  }
}
