export { ATTRIBUTE_SUFFIX, EXTRACTIONS_KEY } from "../internal/core/constants.js";
export {
  AlignmentStatus,
  AnnotatedDocument,
  Document,
  ExampleData,
  Extraction,
  FormatType,
} from "../internal/core/data.js";
export type { CharInterval, TokenInterval } from "../internal/core/types.js";
export { TokenType } from "../internal/tokenizer/types.js";
export type { Token, TokenizedText, Tokenizer } from "../internal/tokenizer/types.js";
export { TextChunk } from "../internal/chunking/chunking.js";

export interface ResolverFormatHandlerConfig {
  formatType?: "json" | "yaml";
  format_type?: "json" | "yaml";
  useWrapper?: boolean;
  use_wrapper?: boolean;
  wrapperKey?: string | null;
  wrapper_key?: string | null;
  useFences?: boolean;
  use_fences?: boolean;
  attributeSuffix?: string;
  attribute_suffix?: string;
  strictFences?: boolean;
  strict_fences?: boolean;
  allowTopLevelList?: boolean;
  allow_top_level_list?: boolean;
}

export interface ExtractResolverParams {
  format_handler?: ResolverFormatHandlerConfig;
  fence_output?: boolean;
  format_type?: "json" | "yaml";
  strict_fences?: boolean;
  require_extractions_key?: boolean;
  extraction_attributes_suffix?: string;
  attribute_suffix?: string;
  extraction_index_suffix?: string | null;
  extractionIndexSuffix?: string | null;
  enable_fuzzy_alignment?: boolean;
  enableFuzzyAlignment?: boolean;
  fuzzy_alignment_threshold?: number;
  fuzzyAlignmentThreshold?: number;
  accept_match_lesser?: boolean;
  acceptMatchLesser?: boolean;
  suppress_parse_errors?: boolean;
  suppressParseErrors?: boolean;
}

export const LANGEXTRACT_WARNING_CODES = {
  AliasLifecycle: "alias_lifecycle",
  BatchLengthBelowMaxWorkers: "batch_length_below_max_workers",
  MissingExamples: "missing_examples",
  PromptAlignmentFailed: "prompt_alignment_failed",
  PromptAlignmentNonExact: "prompt_alignment_non_exact",
  SchemaFencesIncompatible: "schema_fences_incompatible",
  SchemaWrapperIncompatible: "schema_wrapper_incompatible",
  SchemaConstraintsIgnoredWithExplicitModel: "schema_constraints_ignored_with_explicit_model",
  ProviderEnvironment: "provider_environment",
} as const;

export type LangextractWarningCode =
  (typeof LANGEXTRACT_WARNING_CODES)[keyof typeof LANGEXTRACT_WARNING_CODES];

export interface LangextractWarning {
  code: LangextractWarningCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ProviderRoutePatternMetadata {
  providerId: string;
  pattern: string;
  flags: string;
  priority: number;
}

export interface ProviderAliasMetadata {
  alias: string;
  target: string;
  source?: "registry" | "provider";
  providerId?: string;
  lifecycleStage?: "active" | "deprecated" | "sunset" | "removed";
  deprecatedAfter?: string;
  sunsetAfter?: string;
  removedAfter?: string;
  replacement?: string;
}

export interface ProviderFallbackRouteMetadata {
  route: string;
  fallbackRoutes: readonly string[];
}

export interface ProviderRoutingMetadata {
  defaultProviderId: string;
  providers: readonly string[];
  routePatterns: readonly ProviderRoutePatternMetadata[];
  aliases: readonly ProviderAliasMetadata[];
  fallbackRoutes: readonly ProviderFallbackRouteMetadata[];
}

export interface ProviderCapabilityInfo {
  providerId: string;
  hasSchemaHooks: boolean;
  supportsSchemaSynthesis: boolean;
  requiresRawOutput: boolean;
  schemaHookId?: string;
}
