import type { LanguageModel } from "ai";
import {
  AnnotatorPipeline,
  type AnnotatedDocument,
  type InputDocument,
  type ModelCallEvent,
} from "../internal/annotation/index.js";
import { ATTRIBUTE_SUFFIX, EXTRACTIONS_KEY } from "../internal/core/constants.js";
import { InferenceConfigError } from "../internal/core/errors.js";
import { FormatType } from "../internal/core/types.js";
import {
  handleAlignmentReport,
  validatePromptAlignment,
  type PromptSchemaField,
  type PromptValidationLevel,
} from "../internal/prompting/index.js";
import { createResolverFromResolverParams } from "../internal/resolver/index.js";
import type { AISDKModelSettings, LangextractModel } from "../internal/providers/index.js";
import type { Tokenizer } from "../internal/tokenizer/types.js";
import { fetchTextFromUrl, isUrl } from "./io.js";
import {
  getDefaultProviderRegistry,
  getProviderSchemaHooks,
  loadProviderPluginsOnce,
  resolveProviderEnvironment,
  type ProviderRegistry,
} from "./providers.js";
import {
  LANGEXTRACT_WARNING_CODES,
  type ExtractResolverParams,
  type LangextractWarning,
  type LangextractWarningCode,
} from "./types.js";

export { LANGEXTRACT_WARNING_CODES };
export type { ExtractResolverParams, LangextractWarning, LangextractWarningCode };

export interface ExtractDocumentInput {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ExampleExtractionInput {
  extractionClass: string;
  extractionText: string;
  attributes?: Record<string, unknown>;
}

export interface ExampleDataInput {
  text: string;
  extractions: readonly ExampleExtractionInput[];
}

export interface ExtractModelConfig {
  model?: LanguageModel | LangextractModel;
  modelId?: string;
  provider?: string;
  registry?: ProviderRegistry;
  settings?: AISDKModelSettings;
}

interface ExtractSharedOptions {
  model?: LanguageModel | LangextractModel;
  config?: ExtractModelConfig;
  modelId?: string;
  provider?: string;
  registry?: ProviderRegistry;
  settings?: AISDKModelSettings;

  promptDescription?: string;
  examples?: readonly ExampleDataInput[];
  formatType?: FormatType | "json" | "yaml" | "none";
  maxCharBuffer?: number;
  temperature?: number;
  fenceOutput?: boolean;
  useSchemaConstraints?: boolean;
  batchLength?: number;
  maxWorkers?: number;
  additionalContext?: string;
  resolverParams?: ExtractResolverParams;
  languageModelParams?: Record<string, unknown>;
  debug?: boolean;
  modelUrl?: string;
  apiKey?: string;
  extractionPasses?: number;
  contextWindowChars?: number;
  fetchUrls?: boolean;
  promptValidationLevel?: PromptValidationLevel;
  promptLintLevel?: PromptValidationLevel;
  promptValidationStrict?: boolean;
  showProgress?: boolean;
  tokenizer?: Tokenizer;
  onWarning?: (warning: LangextractWarning) => void;

  questions?: readonly string[];
  schema?: readonly PromptSchemaField[];
  promptTemplate?: string;
  promptValidationMaxCharacters?: number;
  onModelCall?: (event: ModelCallEvent) => void;

  // Compatibility aliases (snake_case + previous options)
  prompt_description?: string;
  format_type?: FormatType | "json" | "yaml" | "none";
  max_char_buffer?: number;
  fence_output?: boolean;
  use_schema_constraints?: boolean;
  batch_length?: number;
  max_workers?: number;
  additional_context?: string;
  resolver_params?: ExtractResolverParams;
  language_model_params?: Record<string, unknown>;
  model_url?: string;
  extraction_passes?: number;
  context_window_chars?: number;
  fetch_urls?: boolean;
  prompt_validation_level?: PromptValidationLevel;
  prompt_lint_level?: PromptValidationLevel;
  prompt_validation_strict?: boolean;
  show_progress?: boolean;
  batchSize?: number;
  passes?: number;
  context?: string;
}

export interface ExtractTextOptions extends ExtractSharedOptions {
  text: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractDocumentsOptions extends ExtractSharedOptions {
  documents: readonly ExtractDocumentInput[];
}

export interface ExtractTextResult {
  document: AnnotatedDocument;
  extractions: AnnotatedDocument["extractions"];
}

export interface ExtractDocumentsResult {
  documents: AnnotatedDocument[];
}

interface NormalizedExtractOptions {
  model: LanguageModel | LangextractModel | undefined;
  config: ExtractModelConfig | undefined;
  modelId: string | undefined;
  provider: string | undefined;
  registry: ProviderRegistry | undefined;
  settings: AISDKModelSettings | undefined;

  promptDescription: string | undefined;
  examples: readonly ExampleDataInput[] | undefined;
  formatType: FormatType | "none";
  maxCharBuffer: number;
  temperature: number | undefined;
  fenceOutput: boolean | undefined;
  useSchemaConstraints: boolean;
  batchLength: number;
  maxWorkers: number;
  additionalContext: string | undefined;
  resolverParams: ExtractResolverParams;
  languageModelParams: Record<string, unknown>;
  debug: boolean;
  modelUrl: string | undefined;
  apiKey: string | undefined;
  extractionPasses: number;
  contextWindowChars: number | undefined;
  fetchUrls: boolean;
  promptValidationLevel: PromptValidationLevel;
  promptLintLevel: PromptValidationLevel;
  promptValidationStrict: boolean;
  showProgress: boolean;
  tokenizer: Tokenizer | undefined;
  onWarning: ((warning: LangextractWarning) => void) | undefined;

  questions: readonly string[] | undefined;
  schema: readonly PromptSchemaField[] | undefined;
  promptTemplate: string | undefined;
  promptValidationMaxCharacters: number | undefined;
  onModelCall: ((event: ModelCallEvent) => void) | undefined;
}

const DEFAULT_MAX_CHAR_BUFFER = 1_000;
const DEFAULT_BATCH_LENGTH = 10;
const DEFAULT_MAX_WORKERS = 10;
const DEFAULT_EXTRACTION_PASSES = 1;
const GOOGLE_ALLOWED_LANGUAGE_MODEL_PARAM_KEYS = new Set([
  "tools",
  "tool_config",
  "toolConfig",
  "stop_sequences",
  "stopSequences",
  "system_instruction",
  "systemInstruction",
  "candidate_count",
  "candidateCount",
  "safety_settings",
  "safetySettings",
  "response_schema",
  "responseSchema",
  "response_mime_type",
  "responseMimeType",
  "max_output_tokens",
  "maxOutputTokens",
  "top_k",
  "topK",
  "top_p",
  "topP",
  "seed",
  "temperature",
  "presence_penalty",
  "presencePenalty",
  "frequency_penalty",
  "frequencyPenalty",
]);

export async function extract(options: ExtractTextOptions): Promise<ExtractTextResult>;
export async function extract(options: ExtractDocumentsOptions): Promise<ExtractDocumentsResult>;
export async function extract(
  options: ExtractTextOptions | ExtractDocumentsOptions,
): Promise<ExtractTextResult | ExtractDocumentsResult> {
  const normalized = normalizeOptions(options);
  emitPreflightWarnings(normalized);

  if ((normalized.examples?.length ?? 0) === 0) {
    throw new InferenceConfigError(
      "Examples are required for reliable extraction. Please provide at least one example.",
    );
  }

  if (normalized.promptValidationLevel !== "off") {
    const alignmentExamples = normalized.examples ?? [];
    const enableFuzzyAlignment = readResolverBoolean(
      normalized.resolverParams,
      "enable_fuzzy_alignment",
      "enableFuzzyAlignment",
    );
    const fuzzyAlignmentThreshold = readResolverNumber(normalized.resolverParams);
    const acceptMatchLesser = readResolverBoolean(
      normalized.resolverParams,
      "accept_match_lesser",
      "acceptMatchLesser",
    );

    const alignmentReport = validatePromptAlignment(alignmentExamples, {
      ...(enableFuzzyAlignment !== undefined ? { enableFuzzyAlignment } : {}),
      ...(fuzzyAlignmentThreshold !== undefined ? { fuzzyAlignmentThreshold } : {}),
      ...(acceptMatchLesser !== undefined ? { acceptMatchLesser } : {}),
    });

    handleAlignmentReport(alignmentReport, {
      level: normalized.promptValidationLevel,
      strictNonExact: normalized.promptValidationStrict,
      onWarning: (message, issue) => {
        emitWarning(
          normalized,
          issue.issueKind === "failed"
            ? LANGEXTRACT_WARNING_CODES.PromptAlignmentFailed
            : LANGEXTRACT_WARNING_CODES.PromptAlignmentNonExact,
          message,
          {
            exampleIndex: issue.exampleIndex,
            extractionClass: issue.extractionClass,
            alignmentStatus: issue.alignmentStatus ?? "none",
          },
        );
      },
    });
  }

  await loadProviderPluginsOnce({ registry: resolveRegistry(normalized) });

  const resolvedModel = resolveModel(normalized);
  for (const routingWarning of resolvedModel.routingWarnings ?? []) {
    emitWarning(normalized, LANGEXTRACT_WARNING_CODES.AliasLifecycle, routingWarning);
  }
  const resolvedFenceOutput = resolveFenceOutput(normalized, resolvedModel);
  emitSchemaFormatCompatibilityWarnings(normalized, resolvedModel, resolvedFenceOutput);
  const resolvedSettings = resolveSettings(normalized, resolvedModel);

  if (normalized.model !== undefined && normalized.useSchemaConstraints) {
    emitWarning(
      normalized,
      LANGEXTRACT_WARNING_CODES.SchemaConstraintsIgnoredWithExplicitModel,
      "'useSchemaConstraints' is ignored when 'model' is provided. Configure schema on the explicit model itself.",
    );
  }

  const pipeline = new AnnotatorPipeline({
    model: resolvedModel,
    ...(resolvedSettings !== undefined ? { settings: resolvedSettings } : {}),
    batchSize: normalized.batchLength,
    passes: normalized.extractionPasses,
    promptValidationLevel: normalized.promptValidationLevel,
    promptLintLevel: normalized.promptLintLevel,
    promptValidationStrict: normalized.promptValidationStrict,
    maxCharBuffer: normalized.maxCharBuffer,
    maxWorkers: normalized.maxWorkers,
    showProgress: normalized.showProgress,
    debug: normalized.debug,
    resolverParams: toResolverParamsRecord(normalized.resolverParams),
    formatType: normalized.formatType,
    fenceOutput: resolvedFenceOutput,
    useSchemaConstraints: normalized.useSchemaConstraints,
    ...(normalized.additionalContext !== undefined
      ? { context: normalized.additionalContext }
      : {}),
    ...(normalized.promptDescription !== undefined
      ? { promptDescription: normalized.promptDescription }
      : {}),
    ...(normalized.questions !== undefined ? { questions: normalized.questions } : {}),
    ...(normalized.schema !== undefined ? { schema: normalized.schema } : {}),
    ...(normalized.promptTemplate !== undefined
      ? { promptTemplate: normalized.promptTemplate }
      : {}),
    ...(normalized.promptValidationMaxCharacters !== undefined
      ? { promptValidationMaxCharacters: normalized.promptValidationMaxCharacters }
      : {}),
    ...(normalized.contextWindowChars !== undefined
      ? { contextWindowChars: normalized.contextWindowChars }
      : {}),
    ...(normalized.tokenizer !== undefined ? { tokenizer: normalized.tokenizer } : {}),
    ...(normalized.examples !== undefined ? { examples: normalized.examples } : {}),
    ...(normalized.onModelCall !== undefined ? { onModelCall: normalized.onModelCall } : {}),
  });

  if (isTextOptions(options)) {
    const inputText = await resolveInputText(options.text, normalized.fetchUrls);
    const document: InputDocument = {
      id: options.documentId ?? "text-1",
      text: inputText,
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    };

    const annotated = await pipeline.annotateText(document);
    return {
      document: annotated,
      extractions: annotated.extractions,
    };
  }

  const documents = await Promise.all(
    options.documents.map(async (document) => ({
      id: document.id,
      text: await resolveInputText(document.text, normalized.fetchUrls),
      ...(document.metadata !== undefined ? { metadata: document.metadata } : {}),
    })),
  );
  const annotatedDocuments = await pipeline.annotateDocuments(documents);
  return {
    documents: annotatedDocuments,
  };
}

function normalizeOptions(options: ExtractSharedOptions): NormalizedExtractOptions {
  const formatType = normalizeFormatType(options.formatType ?? options.format_type);

  return {
    model: options.model,
    config: options.config,
    modelId: options.modelId,
    provider: options.provider,
    registry: options.registry,
    settings: options.settings,

    promptDescription: options.promptDescription ?? options.prompt_description,
    examples: options.examples,
    formatType,
    maxCharBuffer: Math.max(
      1,
      Math.floor(options.maxCharBuffer ?? options.max_char_buffer ?? DEFAULT_MAX_CHAR_BUFFER),
    ),
    temperature: options.temperature,
    fenceOutput: options.fenceOutput ?? options.fence_output,
    useSchemaConstraints: options.useSchemaConstraints ?? options.use_schema_constraints ?? true,
    batchLength: Math.max(
      1,
      Math.floor(
        options.batchLength ?? options.batch_length ?? options.batchSize ?? DEFAULT_BATCH_LENGTH,
      ),
    ),
    maxWorkers: Math.max(
      1,
      Math.floor(options.maxWorkers ?? options.max_workers ?? DEFAULT_MAX_WORKERS),
    ),
    additionalContext: options.additionalContext ?? options.additional_context ?? options.context,
    resolverParams: options.resolverParams ?? options.resolver_params ?? {},
    languageModelParams: options.languageModelParams ?? options.language_model_params ?? {},
    debug: options.debug ?? false,
    modelUrl: options.modelUrl ?? options.model_url,
    apiKey: options.apiKey,
    extractionPasses: Math.max(
      1,
      Math.floor(
        options.extractionPasses ??
          options.extraction_passes ??
          options.passes ??
          DEFAULT_EXTRACTION_PASSES,
      ),
    ),
    contextWindowChars: options.contextWindowChars ?? options.context_window_chars,
    fetchUrls: options.fetchUrls ?? options.fetch_urls ?? true,
    promptValidationLevel:
      options.promptValidationLevel ?? options.prompt_validation_level ?? "warn",
    promptLintLevel: options.promptLintLevel ?? options.prompt_lint_level ?? "off",
    promptValidationStrict:
      options.promptValidationStrict ?? options.prompt_validation_strict ?? false,
    showProgress: options.showProgress ?? options.show_progress ?? true,
    tokenizer: options.tokenizer,
    onWarning: options.onWarning,

    questions: options.questions,
    schema: options.schema,
    promptTemplate: options.promptTemplate,
    promptValidationMaxCharacters: options.promptValidationMaxCharacters,
    onModelCall: options.onModelCall,
  };
}

function normalizeFormatType(value: ExtractSharedOptions["formatType"]): FormatType | "none" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "none") {
    return "none";
  }
  if (normalized === FormatType.YAML) {
    return FormatType.YAML;
  }

  return FormatType.JSON;
}

function emitPreflightWarnings(options: NormalizedExtractOptions): void {
  if (options.batchLength < options.maxWorkers) {
    emitWarning(
      options,
      LANGEXTRACT_WARNING_CODES.BatchLengthBelowMaxWorkers,
      `batchLength (${options.batchLength}) < maxWorkers (${options.maxWorkers}). Only ${options.batchLength} workers will be used.`,
      {
        batchLength: options.batchLength,
        maxWorkers: options.maxWorkers,
      },
    );
  }

  if ((options.examples?.length ?? 0) === 0) {
    emitWarning(
      options,
      LANGEXTRACT_WARNING_CODES.MissingExamples,
      "No examples provided. Extraction quality may be lower than parity expectations.",
    );
  }
}

function emitWarning(
  options: Pick<NormalizedExtractOptions, "onWarning">,
  code: LangextractWarningCode,
  message: string,
  details?: Record<string, unknown>,
): void {
  options.onWarning?.({
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

function resolveModel(options: NormalizedExtractOptions): LangextractModel {
  const registry = resolveRegistry(options);

  if (options.model !== undefined) {
    return registry.resolveModel({
      model: options.model,
      ...(options.modelId !== undefined ? { modelId: options.modelId } : {}),
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.settings !== undefined ? { settings: options.settings } : {}),
    });
  }

  if (options.config?.model !== undefined) {
    return registry.resolveModel({
      model: options.config.model,
      ...(options.config.modelId !== undefined ? { modelId: options.config.modelId } : {}),
      ...(options.config.provider !== undefined ? { provider: options.config.provider } : {}),
      ...(options.config.settings !== undefined ? { settings: options.config.settings } : {}),
    });
  }

  const modelId = options.config?.modelId ?? options.modelId;
  const provider = options.config?.provider ?? options.provider;
  const settings = options.config?.settings ?? options.settings;

  return registry.resolveModel({
    ...(modelId !== undefined ? { modelId } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(settings !== undefined ? { settings } : {}),
  });
}

function resolveRegistry(
  options: Pick<NormalizedExtractOptions, "config" | "registry">,
): ProviderRegistry {
  return options.config?.registry ?? options.registry ?? getDefaultProviderRegistry();
}

function resolveSettings(
  options: NormalizedExtractOptions,
  resolvedModel: LangextractModel,
): AISDKModelSettings | undefined {
  const merged: AISDKModelSettings = {
    ...(options.config?.settings ?? {}),
    ...(options.settings ?? {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };

  const registry = resolveRegistry(options);
  const environment = resolveProviderEnvironment(
    `${resolvedModel.provider}:${resolvedModel.modelId}`,
    options.apiKey,
    options.modelUrl,
    registry,
  );

  for (const warning of environment.warnings) {
    emitWarning(options, LANGEXTRACT_WARNING_CODES.ProviderEnvironment, warning);
  }

  if (environment.apiKey !== undefined || environment.baseUrl !== undefined) {
    const providerOptions = {
      ...(merged.providerOptions ?? {}),
      [resolvedModel.provider]: {
        ...(merged.providerOptions?.[resolvedModel.provider] ?? {}),
        ...(environment.apiKey !== undefined ? { apiKey: environment.apiKey } : {}),
        ...(environment.baseUrl !== undefined ? { baseURL: environment.baseUrl } : {}),
      },
    };
    merged.providerOptions = providerOptions;
  }

  const schemaHooks = getProviderSchemaHooks(resolvedModel.provider, registry);
  const examples = options.examples ?? [];
  if (
    options.useSchemaConstraints &&
    examples.length > 0 &&
    typeof schemaHooks?.toProviderConfig === "function"
  ) {
    const providerSchemaConfig = schemaHooks.toProviderConfig(examples, ATTRIBUTE_SUFFIX);
    if (!isPlainRecord(providerSchemaConfig)) {
      throw new InferenceConfigError(
        `Provider schema hooks for "${resolvedModel.provider}" must return an object.`,
      );
    }
    if (Object.keys(providerSchemaConfig).length > 0) {
      merged.providerOptions = {
        ...(merged.providerOptions ?? {}),
        [resolvedModel.provider]: {
          ...(merged.providerOptions?.[resolvedModel.provider] ?? {}),
          ...providerSchemaConfig,
        },
      };
    }
  }

  const languageModelParams = normalizeLanguageModelParams(
    options.languageModelParams,
    resolvedModel.provider,
  );
  if (Object.keys(languageModelParams).length > 0) {
    const currentProviderOptions = merged.providerOptions?.[resolvedModel.provider] ?? {};
    merged.providerOptions = {
      ...(merged.providerOptions ?? {}),
      [resolvedModel.provider]: mergeProviderOptionParams(
        currentProviderOptions,
        languageModelParams,
      ),
    };
  }

  return Object.keys(merged).length === 0 ? undefined : merged;
}

function resolveFenceOutput(
  options: NormalizedExtractOptions,
  resolvedModel: LangextractModel,
): boolean {
  if (options.fenceOutput !== undefined) {
    return options.fenceOutput;
  }

  const registry = resolveRegistry(options);
  const schemaHooks = getProviderSchemaHooks(resolvedModel.provider, registry);
  if (
    options.useSchemaConstraints &&
    (options.examples?.length ?? 0) > 0 &&
    schemaHooks !== undefined
  ) {
    return !schemaHooks.requiresRawOutput;
  }

  return true;
}

function emitSchemaFormatCompatibilityWarnings(
  options: NormalizedExtractOptions,
  resolvedModel: LangextractModel,
  resolvedFenceOutput: boolean,
): void {
  if (!options.useSchemaConstraints || options.model !== undefined) {
    return;
  }

  if ((options.examples?.length ?? 0) === 0) {
    return;
  }

  const registry = resolveRegistry(options);
  const schemaHooks = getProviderSchemaHooks(resolvedModel.provider, registry);
  if (schemaHooks?.requiresRawOutput !== true) {
    return;
  }

  const { formatHandler } = createResolverFromResolverParams({
    resolverParams: toResolverParamsRecord(options.resolverParams),
    baseFormatType: options.formatType === "none" ? "json" : options.formatType,
    baseUseFences: resolvedFenceOutput,
  });

  if (formatHandler.useFences) {
    emitWarning(
      options,
      LANGEXTRACT_WARNING_CODES.SchemaFencesIncompatible,
      "Schema-constrained raw JSON output is used, but fenced output is enabled. Set fenceOutput=false to avoid parse issues.",
    );
  }

  if (!formatHandler.useWrapper || formatHandler.wrapperKey !== EXTRACTIONS_KEY) {
    emitWarning(
      options,
      LANGEXTRACT_WARNING_CODES.SchemaWrapperIncompatible,
      `Schema-constrained output expects wrapper key "${EXTRACTIONS_KEY}". Current settings are useWrapper=${String(formatHandler.useWrapper)} and wrapperKey="${formatHandler.wrapperKey ?? ""}".`,
      {
        expectedWrapperKey: EXTRACTIONS_KEY,
        useWrapper: formatHandler.useWrapper,
        wrapperKey: formatHandler.wrapperKey ?? null,
      },
    );
  }
}

function isTextOptions(
  options: ExtractTextOptions | ExtractDocumentsOptions,
): options is ExtractTextOptions {
  return "text" in options;
}

async function resolveInputText(text: string, fetchUrls: boolean): Promise<string> {
  if (!fetchUrls || !isUrl(text)) {
    return text;
  }

  const fetched = await fetchTextFromUrl(text);
  return fetched.text;
}

function readResolverBoolean(
  resolverParams: ExtractResolverParams,
  snakeCaseKey: string,
  camelCaseKey: string,
): boolean | undefined {
  const resolverParamRecord = resolverParams as Record<string, unknown>;
  const value = resolverParamRecord[snakeCaseKey] ?? resolverParamRecord[camelCaseKey];
  return typeof value === "boolean" ? value : undefined;
}

function readResolverNumber(resolverParams: ExtractResolverParams): number | undefined {
  const resolverParamRecord = resolverParams as Record<string, unknown>;
  const value =
    resolverParamRecord.fuzzy_alignment_threshold ?? resolverParamRecord.fuzzyAlignmentThreshold;
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InferenceConfigError(
      "resolverParams.fuzzyAlignmentThreshold must be a finite number between 0 and 1.",
    );
  }

  if (value < 0 || value > 1) {
    throw new InferenceConfigError(
      "resolverParams.fuzzyAlignmentThreshold must be between 0 and 1.",
    );
  }

  return value;
}

function toResolverParamsRecord(params: ExtractResolverParams): Record<string, unknown> {
  return { ...params };
}

function normalizeLanguageModelParams(
  languageModelParams: Record<string, unknown>,
  providerId: string,
): Record<string, unknown> {
  const normalized = removeNullishEntries({ ...languageModelParams });
  const reasoningEffort = normalized.reasoning_effort ?? normalized.reasoningEffort;

  if (typeof reasoningEffort === "string" && reasoningEffort.trim().length > 0) {
    const existingReasoning = asPlainRecord(normalized.reasoning) ?? {};
    normalized.reasoning = {
      ...existingReasoning,
      effort: reasoningEffort,
    };
  }

  if ("response_format" in normalized && !("responseFormat" in normalized)) {
    normalized.responseFormat = normalized.response_format;
  }

  delete normalized.reasoning_effort;
  delete normalized.reasoningEffort;
  delete normalized.response_format;

  return filterProviderLanguageModelParams(providerId, normalized);
}

function mergeProviderOptionParams(
  existingProviderOptions: Record<string, unknown>,
  languageModelParams: Record<string, unknown>,
): Record<string, unknown> {
  const existingReasoning = asPlainRecord(existingProviderOptions.reasoning);
  const incomingReasoning = asPlainRecord(languageModelParams.reasoning);
  const mergedReasoning =
    incomingReasoning !== undefined
      ? {
          ...(existingReasoning ?? {}),
          ...incomingReasoning,
        }
      : existingReasoning;

  return removeUndefinedEntries({
    ...existingProviderOptions,
    ...languageModelParams,
    ...(mergedReasoning !== undefined ? { reasoning: mergedReasoning } : {}),
  });
}

function removeUndefinedEntries(input: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (isPlainRecord(value)) {
      cleaned[key] = removeUndefinedEntries(value);
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

function removeNullishEntries(input: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (isPlainRecord(value)) {
      cleaned[key] = removeNullishEntries(value);
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

function filterProviderLanguageModelParams(
  providerId: string,
  languageModelParams: Record<string, unknown>,
): Record<string, unknown> {
  if (providerId !== "google") {
    return languageModelParams;
  }

  return Object.fromEntries(
    Object.entries(languageModelParams).filter(([key]) =>
      GOOGLE_ALLOWED_LANGUAGE_MODEL_PARAM_KEYS.has(key),
    ),
  );
}

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainRecord(value) ? value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
