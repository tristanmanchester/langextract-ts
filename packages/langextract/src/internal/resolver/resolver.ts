import { ATTRIBUTE_SUFFIX } from "../core/constants.js";
import { FormatType } from "../core/types.js";
import {
  FormatHandler,
  FormatParseError,
  type FormatHandlerFromResolverParamsResult,
} from "./format-handler.js";
import { WordAligner } from "./word-aligner.js";
import type { RawExtraction, ResolveInput, ResolvedExtraction } from "./types.js";

const DEFAULT_LABEL = "unknown";
const DEFAULT_FUZZY_ALIGNMENT_THRESHOLD = 0.75;
const MIN_FUZZY_ALIGNMENT_THRESHOLD = 0;
const MAX_FUZZY_ALIGNMENT_THRESHOLD = 1;

export const ALIGNMENT_PARAM_KEYS = new Set([
  "enable_fuzzy_alignment",
  "fuzzy_alignment_threshold",
  "accept_match_lesser",
  "suppress_parse_errors",
]);

export interface ResolverOptions {
  formatHandler?: FormatHandler;
  wordAligner?: WordAligner;
  extractionIndexSuffix?: string | null;
  enableFuzzyAlignment?: boolean;
  fuzzyAlignmentThreshold?: number;
  acceptMatchLesser?: boolean;
  suppressParseErrors?: boolean;
}

export interface CreateResolverFromParamsOptions {
  resolverParams?: Record<string, unknown>;
  baseFormatType?: FormatType | "json" | "yaml";
  baseUseFences?: boolean;
  baseAttributeSuffix?: string;
  baseUseWrapper?: boolean;
  baseWrapperKey?: string | null;
}

export interface CreateResolverFromParamsResult {
  resolver: Resolver;
  formatHandler: FormatHandler;
  legacyFormatKeysUsed: string[];
}

interface IndexedCandidate extends RawExtraction {
  text: string;
  label: string;
  attributes?: Record<string, unknown>;
  extractionIndex: number;
  groupIndex: number;
  sequence: number;
}

export class Resolver {
  private readonly formatHandler: FormatHandler;
  private readonly wordAligner: WordAligner;
  private readonly extractionIndexSuffix: string | null;
  private readonly enableFuzzyAlignment: boolean;
  private readonly fuzzyAlignmentThreshold: number;
  private readonly acceptMatchLesser: boolean;
  private readonly suppressParseErrors: boolean;

  public constructor(options: ResolverOptions = {}) {
    this.formatHandler = options.formatHandler ?? new FormatHandler();
    this.extractionIndexSuffix = options.extractionIndexSuffix ?? null;
    this.enableFuzzyAlignment = options.enableFuzzyAlignment ?? true;
    if (options.fuzzyAlignmentThreshold !== undefined) {
      assertValidFuzzyAlignmentThreshold(
        options.fuzzyAlignmentThreshold,
        "fuzzyAlignmentThreshold",
      );
    }
    this.fuzzyAlignmentThreshold =
      options.fuzzyAlignmentThreshold ?? DEFAULT_FUZZY_ALIGNMENT_THRESHOLD;
    this.acceptMatchLesser = options.acceptMatchLesser ?? true;
    this.suppressParseErrors = options.suppressParseErrors ?? false;
    this.wordAligner =
      options.wordAligner ??
      new WordAligner({
        fuzzyThreshold: this.fuzzyAlignmentThreshold,
      });
  }

  public resolve(input: ResolveInput): ResolvedExtraction[] {
    const suppressParseErrors = input.suppressParseErrors ?? this.suppressParseErrors;

    let parsedItems: Array<Record<string, unknown>>;
    try {
      parsedItems = this.formatHandler.parse(input.modelOutput).value;
    } catch (error) {
      if (error instanceof FormatParseError) {
        if (suppressParseErrors) {
          return [];
        }
        throw error;
      }

      throw new FormatParseError("Failed to parse model output.", input.modelOutput);
    }

    const candidates = this.toCandidateRecords(parsedItems);

    const enableFuzzyAlignment = input.enableFuzzyAlignment ?? this.enableFuzzyAlignment;
    if (input.fuzzyAlignmentThreshold !== undefined) {
      assertValidFuzzyAlignmentThreshold(input.fuzzyAlignmentThreshold, "fuzzyAlignmentThreshold");
    }
    const fuzzyAlignmentThreshold = input.fuzzyAlignmentThreshold ?? this.fuzzyAlignmentThreshold;
    const acceptMatchLesser = input.acceptMatchLesser ?? this.acceptMatchLesser;

    return candidates
      .map((candidate) =>
        this.resolveCandidate(input.sourceText, candidate, {
          enableFuzzyAlignment,
          fuzzyAlignmentThreshold,
          acceptMatchLesser,
        }),
      )
      .filter((candidate): candidate is ResolvedExtraction => candidate !== null);
  }

  private toCandidateRecords(parsedItems: Array<Record<string, unknown>>): RawExtraction[] {
    const structuredCandidates: RawExtraction[] = [];
    const classBasedGroups: Array<Record<string, unknown>> = [];

    for (const item of parsedItems) {
      if (isStructuredExtractionRecord(item)) {
        structuredCandidates.push(item as RawExtraction);
        continue;
      }

      classBasedGroups.push(item);
    }

    if (classBasedGroups.length > 0) {
      structuredCandidates.push(...this.extractClassBasedCandidates(classBasedGroups));
    }

    return structuredCandidates;
  }

  private extractClassBasedCandidates(
    extractionData: Array<Record<string, unknown>>,
  ): RawExtraction[] {
    const processed: IndexedCandidate[] = [];

    let appearanceIndex = 0;
    const indexSuffix = this.extractionIndexSuffix;
    const attributeSuffix = this.formatHandler.attributeSuffix || ATTRIBUTE_SUFFIX;

    for (const [groupIndex, group] of extractionData.entries()) {
      for (const [extractionClass, extractionValue] of Object.entries(group)) {
        if (indexSuffix !== null && extractionClass.endsWith(indexSuffix)) {
          if (!Number.isInteger(extractionValue)) {
            throw new TypeError("Index must be an integer.");
          }
          continue;
        }

        if (attributeSuffix.length > 0 && extractionClass.endsWith(attributeSuffix)) {
          if (!(isRecord(extractionValue) || extractionValue === null)) {
            throw new TypeError("Extraction value must be a dict or null for attributes.");
          }
          continue;
        }

        if (
          typeof extractionValue !== "string" &&
          typeof extractionValue !== "number" &&
          typeof extractionValue !== "bigint"
        ) {
          throw new TypeError("Extraction text must be a string, integer, or float.");
        }

        const extractionText = String(extractionValue);

        let extractionIndex: number;
        if (indexSuffix !== null) {
          const indexKey = `${extractionClass}${indexSuffix}`;
          const indexValue = group[indexKey];
          if (indexValue === undefined || indexValue === null) {
            continue;
          }
          if (!Number.isInteger(indexValue)) {
            throw new TypeError("Index must be an integer.");
          }
          extractionIndex = Number(indexValue);
        } else {
          appearanceIndex += 1;
          extractionIndex = appearanceIndex;
        }

        const attributesKey = `${extractionClass}${attributeSuffix}`;
        const rawAttributes = group[attributesKey];
        if (rawAttributes !== undefined && rawAttributes !== null && !isRecord(rawAttributes)) {
          throw new TypeError("Extraction value must be a dict or null for attributes.");
        }

        processed.push({
          text: extractionText,
          label: extractionClass,
          ...(isRecord(rawAttributes) ? { attributes: rawAttributes } : {}),
          extractionIndex,
          groupIndex,
          sequence: processed.length,
        });
      }
    }

    processed.sort((a, b) => {
      if (a.extractionIndex !== b.extractionIndex) {
        return a.extractionIndex - b.extractionIndex;
      }
      if (a.groupIndex !== b.groupIndex) {
        return a.groupIndex - b.groupIndex;
      }
      return a.sequence - b.sequence;
    });

    return processed.map((item) => ({
      text: item.text,
      label: item.label,
      ...(item.attributes !== undefined ? { attributes: item.attributes } : {}),
    }));
  }

  private resolveCandidate(
    sourceText: string,
    candidate: RawExtraction,
    options: {
      enableFuzzyAlignment: boolean;
      fuzzyAlignmentThreshold: number;
      acceptMatchLesser: boolean;
    },
  ): ResolvedExtraction | null {
    const explicitStart = toInteger(candidate.start);
    const explicitEnd = toInteger(candidate.end);

    const candidateText =
      firstString(candidate.text, candidate.value, candidate.snippet, candidate.span) ??
      (explicitStart !== null &&
      explicitEnd !== null &&
      explicitStart >= 0 &&
      explicitEnd <= sourceText.length
        ? sourceText.slice(explicitStart, explicitEnd)
        : "");

    const normalizedText = candidateText.trim();
    if (normalizedText.length === 0) {
      return null;
    }

    const alignment = this.wordAligner.align(sourceText, normalizedText, {
      ...(explicitStart !== null ? { hintStart: explicitStart } : {}),
      ...(explicitEnd !== null ? { hintEnd: explicitEnd } : {}),
      enableFuzzyAlignment: options.enableFuzzyAlignment,
      fuzzyAlignmentThreshold: options.fuzzyAlignmentThreshold,
      acceptMatchLesser: options.acceptMatchLesser,
    });

    const label = firstString(candidate.label, candidate.category, candidate.type) ?? DEFAULT_LABEL;
    const confidence = toNumber(candidate.confidence);

    return {
      text: alignment.text,
      label,
      start: alignment.start,
      end: alignment.end,
      alignmentStatus: alignment.status,
      alignmentScore: alignment.score,
      raw: candidate,
      ...(confidence !== null ? { confidence } : {}),
    };
  }
}

export function createResolverFromResolverParams(
  options: CreateResolverFromParamsOptions = {},
): CreateResolverFromParamsResult {
  const formatHandlerResult: FormatHandlerFromResolverParamsResult =
    FormatHandler.fromResolverParams({
      ...(options.resolverParams !== undefined ? { resolverParams: options.resolverParams } : {}),
      baseFormatType: options.baseFormatType ?? FormatType.JSON,
      baseUseFences: options.baseUseFences ?? true,
      baseAttributeSuffix: options.baseAttributeSuffix ?? ATTRIBUTE_SUFFIX,
      baseUseWrapper: options.baseUseWrapper ?? true,
      ...(options.baseWrapperKey !== undefined ? { baseWrapperKey: options.baseWrapperKey } : {}),
    });

  const params = { ...formatHandlerResult.remainingResolverParams };

  const extractionIndexSuffix = pickStringOrNull(params, [
    "extraction_index_suffix",
    "extractionIndexSuffix",
  ]);

  const enableFuzzyAlignment = pickBooleanOrNull(params, [
    "enable_fuzzy_alignment",
    "enableFuzzyAlignment",
  ]);
  const fuzzyAlignmentThreshold = pickNumberOrNull(params, [
    "fuzzy_alignment_threshold",
    "fuzzyAlignmentThreshold",
  ]);
  const acceptMatchLesser = pickBooleanOrNull(params, ["accept_match_lesser", "acceptMatchLesser"]);
  const suppressParseErrors = pickBooleanOrNull(params, [
    "suppress_parse_errors",
    "suppressParseErrors",
  ]);

  const unknownKeys = Object.keys(params).filter((key) => params[key] !== undefined);
  if (unknownKeys.length > 0) {
    const firstKey = unknownKeys[0];
    throw new TypeError(`Unknown key in resolver_params; check spelling: ${firstKey}`);
  }

  return {
    resolver: new Resolver({
      formatHandler: formatHandlerResult.formatHandler,
      ...(extractionIndexSuffix !== null ? { extractionIndexSuffix } : {}),
      ...(enableFuzzyAlignment !== null ? { enableFuzzyAlignment } : {}),
      ...(fuzzyAlignmentThreshold !== null ? { fuzzyAlignmentThreshold } : {}),
      ...(acceptMatchLesser !== null ? { acceptMatchLesser } : {}),
      ...(suppressParseErrors !== null ? { suppressParseErrors } : {}),
    }),
    formatHandler: formatHandlerResult.formatHandler,
    legacyFormatKeysUsed: formatHandlerResult.legacyKeysUsed,
  };
}

function pickStringOrNull(params: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }

    delete params[key];
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new TypeError(`Expected string for resolver_params.${key}`);
    }

    return value;
  }

  return null;
}

function pickBooleanOrNull(params: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }

    delete params[key];
    if (value === null) {
      return null;
    }
    if (typeof value !== "boolean") {
      throw new TypeError(`Expected boolean for resolver_params.${key}`);
    }

    return value;
  }

  return null;
}

function pickNumberOrNull(params: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }

    delete params[key];
    if (value === null) {
      return null;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`Expected number for resolver_params.${key}`);
    }

    return value;
  }

  return null;
}

function assertValidFuzzyAlignmentThreshold(value: number, keyName: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${keyName} must be a finite number.`);
  }
  if (value < MIN_FUZZY_ALIGNMENT_THRESHOLD || value > MAX_FUZZY_ALIGNMENT_THRESHOLD) {
    throw new TypeError(
      `${keyName} must be between ${MIN_FUZZY_ALIGNMENT_THRESHOLD} and ${MAX_FUZZY_ALIGNMENT_THRESHOLD}.`,
    );
  }
}

function isStructuredExtractionRecord(value: Record<string, unknown>): boolean {
  return "text" in value || "value" in value || "snippet" in value || "span" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}
