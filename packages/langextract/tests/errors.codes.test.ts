import assert from "node:assert/strict";
import { test } from "vitest";

import {
  BaseTokenizerError,
  FormatError,
  FormatParseError,
  InferenceConfigError,
  InferenceError,
  InferenceOutputError,
  InferenceRuntimeError,
  InternalError,
  InvalidDocumentError,
  InvalidTokenIntervalError,
  LANGEXTRACT_ERROR_CODES,
  LangExtractError,
  PromptAlignmentError,
  PromptValidationError,
  ProviderError,
  ResolverFormatParseError,
  SchemaError,
  SentenceRangeError,
  TokenUtilError,
  getLangextractErrorCode,
} from "../src/public/errors.js";

void test("getLangextractErrorCode maps known error hierarchy", () => {
  const validationError = new PromptValidationError({ level: "error", valid: false, issues: [] });
  const alignmentError = new PromptAlignmentError("alignment", {
    issues: [],
    hasFailed: true,
    hasNonExact: false,
  });

  assert.equal(
    getLangextractErrorCode(alignmentError),
    LANGEXTRACT_ERROR_CODES.PromptAlignmentError,
  );
  assert.equal(
    getLangextractErrorCode(validationError),
    LANGEXTRACT_ERROR_CODES.PromptValidationError,
  );
  assert.equal(
    getLangextractErrorCode(new ResolverFormatParseError("resolver parse", "{}")),
    LANGEXTRACT_ERROR_CODES.FormatParseError,
  );
  assert.equal(
    getLangextractErrorCode(new FormatParseError("core parse")),
    LANGEXTRACT_ERROR_CODES.FormatParseError,
  );
  assert.equal(
    getLangextractErrorCode(new FormatError("format")),
    LANGEXTRACT_ERROR_CODES.FormatError,
  );
  assert.equal(
    getLangextractErrorCode(new InferenceConfigError("config")),
    LANGEXTRACT_ERROR_CODES.InferenceConfigError,
  );
  assert.equal(
    getLangextractErrorCode(new InferenceRuntimeError("runtime")),
    LANGEXTRACT_ERROR_CODES.InferenceRuntimeError,
  );
  assert.equal(
    getLangextractErrorCode(new InferenceOutputError("output")),
    LANGEXTRACT_ERROR_CODES.InferenceOutputError,
  );
  assert.equal(
    getLangextractErrorCode(new InferenceError("inference")),
    LANGEXTRACT_ERROR_CODES.InferenceError,
  );
  assert.equal(
    getLangextractErrorCode(new InvalidDocumentError("doc")),
    LANGEXTRACT_ERROR_CODES.InvalidDocumentError,
  );
  assert.equal(
    getLangextractErrorCode(new ProviderError("provider")),
    LANGEXTRACT_ERROR_CODES.ProviderError,
  );
  assert.equal(
    getLangextractErrorCode(new SchemaError("schema")),
    LANGEXTRACT_ERROR_CODES.SchemaError,
  );
  assert.equal(
    getLangextractErrorCode(new InternalError("internal")),
    LANGEXTRACT_ERROR_CODES.InternalError,
  );
  assert.equal(
    getLangextractErrorCode(new InvalidTokenIntervalError("interval")),
    LANGEXTRACT_ERROR_CODES.InvalidTokenIntervalError,
  );
  assert.equal(
    getLangextractErrorCode(new SentenceRangeError("range")),
    LANGEXTRACT_ERROR_CODES.SentenceRangeError,
  );
  assert.equal(
    getLangextractErrorCode(new BaseTokenizerError("tokenizer")),
    LANGEXTRACT_ERROR_CODES.BaseTokenizerError,
  );
  assert.equal(
    getLangextractErrorCode(new TokenUtilError("token util")),
    LANGEXTRACT_ERROR_CODES.TokenUtilError,
  );
  assert.equal(
    getLangextractErrorCode(new LangExtractError("root")),
    LANGEXTRACT_ERROR_CODES.LangExtractError,
  );
  assert.equal(getLangextractErrorCode(new Error("unknown")), LANGEXTRACT_ERROR_CODES.UnknownError);
});

void test("public errors keep stable class names", () => {
  assert.equal(new LangExtractError("x").name, "LangExtractError");
  assert.equal(new InferenceError("x").name, "InferenceError");
  assert.equal(new InferenceConfigError("x").name, "InferenceConfigError");
  assert.equal(new InferenceRuntimeError("x").name, "InferenceRuntimeError");
  assert.equal(new InferenceOutputError("x").name, "InferenceOutputError");
  assert.equal(new InvalidDocumentError("x").name, "InvalidDocumentError");
  assert.equal(new InternalError("x").name, "InternalError");
  assert.equal(new ProviderError("x").name, "ProviderError");
  assert.equal(new SchemaError("x").name, "SchemaError");
  assert.equal(new FormatError("x").name, "FormatError");
  assert.equal(new FormatParseError("x").name, "FormatParseError");
});
