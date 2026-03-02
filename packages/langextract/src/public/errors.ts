import {
  FormatError,
  FormatParseError as CoreFormatParseError,
  InferenceConfigError,
  InferenceError,
  InferenceOutputError,
  InferenceRuntimeError,
  InternalError,
  InvalidDocumentError,
  LangExtractError,
  ProviderError,
  SchemaError,
} from "../internal/core/errors.js";
import { PromptAlignmentError, PromptValidationError } from "../internal/prompting/index.js";
import { FormatParseError as ResolverFormatParseError } from "../internal/resolver/format-handler.js";
import {
  BaseTokenizerError,
  InvalidTokenIntervalError,
  SentenceRangeError,
} from "../internal/tokenizer/errors.js";
import { TokenUtilError } from "../internal/chunking/errors.js";

export {
  FormatError,
  CoreFormatParseError as FormatParseError,
  InferenceConfigError,
  InferenceError,
  InferenceOutputError,
  InferenceRuntimeError,
  InternalError,
  InvalidDocumentError,
  LangExtractError,
  PromptAlignmentError,
  PromptValidationError,
  ProviderError,
  ResolverFormatParseError,
  SchemaError,
  BaseTokenizerError,
  InvalidTokenIntervalError,
  SentenceRangeError,
  TokenUtilError,
};

export const LANGEXTRACT_ERROR_CODES = {
  UnknownError: "unknown_error",
  LangExtractError: "langextract_error",
  InferenceError: "inference_error",
  InferenceConfigError: "inference_config_error",
  InferenceRuntimeError: "inference_runtime_error",
  InferenceOutputError: "inference_output_error",
  InvalidDocumentError: "invalid_document_error",
  InternalError: "internal_error",
  ProviderError: "provider_error",
  SchemaError: "schema_error",
  FormatError: "format_error",
  FormatParseError: "format_parse_error",
  PromptValidationError: "prompt_validation_error",
  PromptAlignmentError: "prompt_alignment_error",
  BaseTokenizerError: "base_tokenizer_error",
  InvalidTokenIntervalError: "invalid_token_interval_error",
  SentenceRangeError: "sentence_range_error",
  TokenUtilError: "token_util_error",
} as const;

export type LangextractErrorCode =
  (typeof LANGEXTRACT_ERROR_CODES)[keyof typeof LANGEXTRACT_ERROR_CODES];

export function getLangextractErrorCode(error: unknown): LangextractErrorCode {
  if (error instanceof PromptAlignmentError) {
    return LANGEXTRACT_ERROR_CODES.PromptAlignmentError;
  }
  if (error instanceof PromptValidationError) {
    return LANGEXTRACT_ERROR_CODES.PromptValidationError;
  }
  if (error instanceof ResolverFormatParseError || error instanceof CoreFormatParseError) {
    return LANGEXTRACT_ERROR_CODES.FormatParseError;
  }
  if (error instanceof FormatError) {
    return LANGEXTRACT_ERROR_CODES.FormatError;
  }
  if (error instanceof InferenceConfigError) {
    return LANGEXTRACT_ERROR_CODES.InferenceConfigError;
  }
  if (error instanceof InferenceRuntimeError) {
    return LANGEXTRACT_ERROR_CODES.InferenceRuntimeError;
  }
  if (error instanceof InferenceOutputError) {
    return LANGEXTRACT_ERROR_CODES.InferenceOutputError;
  }
  if (error instanceof InferenceError) {
    return LANGEXTRACT_ERROR_CODES.InferenceError;
  }
  if (error instanceof InvalidDocumentError) {
    return LANGEXTRACT_ERROR_CODES.InvalidDocumentError;
  }
  if (error instanceof ProviderError) {
    return LANGEXTRACT_ERROR_CODES.ProviderError;
  }
  if (error instanceof SchemaError) {
    return LANGEXTRACT_ERROR_CODES.SchemaError;
  }
  if (error instanceof InternalError) {
    return LANGEXTRACT_ERROR_CODES.InternalError;
  }
  if (error instanceof InvalidTokenIntervalError) {
    return LANGEXTRACT_ERROR_CODES.InvalidTokenIntervalError;
  }
  if (error instanceof SentenceRangeError) {
    return LANGEXTRACT_ERROR_CODES.SentenceRangeError;
  }
  if (error instanceof BaseTokenizerError) {
    return LANGEXTRACT_ERROR_CODES.BaseTokenizerError;
  }
  if (error instanceof TokenUtilError) {
    return LANGEXTRACT_ERROR_CODES.TokenUtilError;
  }
  if (error instanceof LangExtractError) {
    return LANGEXTRACT_ERROR_CODES.LangExtractError;
  }

  return LANGEXTRACT_ERROR_CODES.UnknownError;
}
