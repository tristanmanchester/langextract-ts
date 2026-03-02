import { ATTRIBUTE_SUFFIX, EXTRACTIONS_KEY } from "../core/constants.js";
import { FormatType } from "../core/types.js";

const FENCE_PATTERN = /```([A-Za-z0-9_+-]+)?(?:\s*\n)?([\s\S]*?)```/g;
const THINK_TAG_PATTERN = /<think>[\s\S]*?<\/think>\s*/gi;

export type ParsedFormat = "json" | "yaml";
export type ExtractionValueType = string | number | Record<string, unknown> | unknown[] | null;

export interface ParseResult {
  format: ParsedFormat;
  value: Array<Record<string, ExtractionValueType>>;
  fromFence: boolean;
}

export interface FormatHandlerOptions {
  formatType?: FormatType | ParsedFormat;
  useWrapper?: boolean;
  wrapperKey?: string | null;
  useFences?: boolean;
  attributeSuffix?: string;
  strictFences?: boolean;
  allowTopLevelList?: boolean;
}

export interface FormatHandlerFromResolverParamsOptions {
  resolverParams?: Record<string, unknown>;
  baseFormatType: FormatType | ParsedFormat;
  baseUseFences: boolean;
  baseAttributeSuffix?: string;
  baseUseWrapper?: boolean;
  baseWrapperKey?: string | null;
}

export interface FormatHandlerFromResolverParamsResult {
  formatHandler: FormatHandler;
  remainingResolverParams: Record<string, unknown>;
  legacyKeysUsed: string[];
}

export interface ParseOptions {
  strict?: boolean;
}

export class FormatParseError extends Error {
  public readonly originalInput: string;

  public constructor(message: string, originalInput: string) {
    super(message);
    this.name = "FormatParseError";
    this.originalInput = originalInput;
  }
}

const LEGACY_FORMAT_KEYS = new Set([
  "fence_output",
  "format_type",
  "strict_fences",
  "require_extractions_key",
  "extraction_attributes_suffix",
  "attribute_suffix",
  "format_handler",
]);

export class FormatHandler {
  public readonly formatType: ParsedFormat;
  public readonly useWrapper: boolean;
  public readonly wrapperKey: string | undefined;
  public readonly useFences: boolean;
  public readonly attributeSuffix: string;
  public readonly strictFences: boolean;
  public readonly allowTopLevelList: boolean;

  public constructor(options: FormatHandlerOptions = {}) {
    this.formatType = normalizeFormatType(options.formatType ?? FormatType.JSON);
    this.useWrapper = options.useWrapper ?? true;
    this.wrapperKey = this.useWrapper ? (options.wrapperKey ?? EXTRACTIONS_KEY) : undefined;
    this.useFences = options.useFences ?? true;
    this.attributeSuffix = options.attributeSuffix ?? ATTRIBUTE_SUFFIX;
    this.strictFences = options.strictFences ?? false;
    this.allowTopLevelList = options.allowTopLevelList ?? true;
  }

  public static fromResolverParams(
    options: FormatHandlerFromResolverParamsOptions,
  ): FormatHandlerFromResolverParamsResult {
    const params = { ...(options.resolverParams ?? {}) };

    const explicitFormatHandler = parseExplicitFormatHandler(params.format_handler);
    if (explicitFormatHandler !== null) {
      delete params.format_handler;
      for (const key of LEGACY_FORMAT_KEYS) {
        delete params[key];
      }

      return {
        formatHandler: explicitFormatHandler,
        remainingResolverParams: params,
        legacyKeysUsed: [],
      };
    }

    const baseUseWrapper = options.baseUseWrapper ?? true;
    const baseWrapperKey =
      baseUseWrapper === true ? (options.baseWrapperKey ?? EXTRACTIONS_KEY) : null;

    const formatHandlerOptions: FormatHandlerOptions = {
      formatType: options.baseFormatType,
      useFences: options.baseUseFences,
      attributeSuffix: options.baseAttributeSuffix ?? ATTRIBUTE_SUFFIX,
      useWrapper: baseUseWrapper,
      wrapperKey: baseWrapperKey,
    };

    const mapping: Array<
      [
        legacyKey: string,
        targetKey: "useFences" | "formatType" | "strictFences" | "useWrapper" | "attributeSuffix",
      ]
    > = [
      ["fence_output", "useFences"],
      ["format_type", "formatType"],
      ["strict_fences", "strictFences"],
      ["require_extractions_key", "useWrapper"],
      ["extraction_attributes_suffix", "attributeSuffix"],
      ["attribute_suffix", "attributeSuffix"],
    ];

    const legacyKeysUsed: string[] = [];
    for (const [legacyKey, targetKey] of mapping) {
      const value = params[legacyKey];
      if (value === null || value === undefined) {
        continue;
      }

      legacyKeysUsed.push(legacyKey);
      delete params[legacyKey];

      switch (targetKey) {
        case "formatType": {
          formatHandlerOptions.formatType = normalizeFormatType(value);
          break;
        }
        case "useFences":
        case "strictFences":
        case "useWrapper": {
          if (typeof value !== "boolean") {
            throw new TypeError(`Expected boolean for resolver_params.${legacyKey}`);
          }
          formatHandlerOptions[targetKey] = value;
          break;
        }
        case "attributeSuffix": {
          if (typeof value !== "string") {
            throw new TypeError(`Expected string for resolver_params.${legacyKey}`);
          }
          formatHandlerOptions.attributeSuffix = value;
          break;
        }
        default:
          break;
      }
    }

    if (formatHandlerOptions.useWrapper === false) {
      formatHandlerOptions.wrapperKey = null;
    }

    return {
      formatHandler: new FormatHandler(formatHandlerOptions),
      remainingResolverParams: params,
      legacyKeysUsed,
    };
  }

  public formatExtractionExample(
    extractions: readonly {
      extractionClass: string;
      extractionText: string;
      attributes?: Record<string, unknown>;
    }[],
  ): string {
    const items = extractions.map((extraction) => ({
      [extraction.extractionClass]: extraction.extractionText,
      [`${extraction.extractionClass}${this.attributeSuffix}`]: extraction.attributes ?? {},
    }));

    const payload =
      this.useWrapper && this.wrapperKey !== undefined ? { [this.wrapperKey]: items } : items;

    const body =
      this.formatType === "yaml" ? stringifyYaml(payload) : JSON.stringify(payload, null, 2);

    return this.useFences ? this.addFences(body) : body;
  }

  public parse(input: string, options: ParseOptions = {}): ParseResult {
    const trimmedInput = input.trim();
    if (trimmedInput.length === 0) {
      throw new FormatParseError("Empty or invalid input string.", input);
    }

    const strict = options.strict ?? false;
    const extraction = this.extractContent(trimmedInput);

    let parsed: unknown;
    try {
      parsed = this.parseWithFallback(extraction.content, strict);
    } catch (error) {
      if (error instanceof Error) {
        throw new FormatParseError(
          `Failed to parse ${this.formatType.toUpperCase()} content: ${error.message.slice(0, 200)}`,
          input,
        );
      }

      throw new FormatParseError(
        `Failed to parse ${this.formatType.toUpperCase()} content.`,
        input,
      );
    }

    const normalized = this.normalizeParsedOutput(parsed, strict, input);

    return {
      format: this.formatType,
      value: normalized,
      fromFence: extraction.fromFence,
    };
  }

  private normalizeParsedOutput(
    parsed: unknown,
    strict: boolean,
    originalInput: string,
  ): Array<Record<string, ExtractionValueType>> {
    const requireWrapper = this.wrapperKey !== undefined && (this.useWrapper || strict);

    let items: unknown;
    if (Array.isArray(parsed)) {
      if (requireWrapper && (strict || !this.allowTopLevelList)) {
        throw new FormatParseError(
          `Content must be a mapping with an '${this.wrapperKey}' key.`,
          originalInput,
        );
      }

      if (strict && this.useWrapper) {
        throw new FormatParseError("Strict mode requires a wrapper object.", originalInput);
      }

      if (!this.allowTopLevelList) {
        throw new FormatParseError("Top-level list is not allowed.", originalInput);
      }

      items = parsed;
    } else if (isRecord(parsed)) {
      if (requireWrapper) {
        if (!this.wrapperKey || !(this.wrapperKey in parsed)) {
          throw new FormatParseError(
            `Content must contain an '${this.wrapperKey}' key.`,
            originalInput,
          );
        }
        items = parsed[this.wrapperKey];
      } else if (EXTRACTIONS_KEY in parsed) {
        items = parsed[EXTRACTIONS_KEY];
      } else if (this.wrapperKey !== undefined && this.wrapperKey in parsed) {
        items = parsed[this.wrapperKey];
      } else {
        items = [parsed];
      }
    } else {
      throw new FormatParseError(`Expected list or dict, got ${typeof parsed}.`, originalInput);
    }

    if (!Array.isArray(items)) {
      throw new FormatParseError(
        "The extractions must be a sequence (list) of mappings.",
        originalInput,
      );
    }

    for (const item of items) {
      if (!isRecord(item)) {
        throw new FormatParseError("Each item in the sequence must be a mapping.", originalInput);
      }

      for (const key of Object.keys(item)) {
        if (typeof key !== "string") {
          throw new FormatParseError("All extraction keys must be strings.", originalInput);
        }
      }
    }

    return items as Array<Record<string, ExtractionValueType>>;
  }

  private parseWithFallback(content: string, strict: boolean): unknown {
    try {
      return this.parseByFormat(content);
    } catch (error) {
      if (strict) {
        throw error;
      }

      if (THINK_TAG_PATTERN.test(content)) {
        const stripped = content.replace(THINK_TAG_PATTERN, "").trim();
        return this.parseByFormat(stripped);
      }

      throw error;
    }
  }

  private parseByFormat(content: string): unknown {
    if (this.formatType === "yaml") {
      return parseYaml(content);
    }

    return JSON.parse(content);
  }

  private extractContent(input: string): { content: string; fromFence: boolean } {
    if (!this.useFences) {
      return {
        content: input.trim(),
        fromFence: false,
      };
    }

    const matches = extractFencedBlocks(input);
    const validCandidates = matches.filter((match) => this.isValidLanguageTag(match.language));

    if (this.strictFences) {
      if (validCandidates.length === 0) {
        throw new FormatParseError("Input string does not contain valid fence markers.", input);
      }
      if (validCandidates.length > 1) {
        throw new FormatParseError("Multiple fenced blocks found. Expected exactly one.", input);
      }

      const onlyCandidate = validCandidates[0];
      if (onlyCandidate === undefined) {
        throw new FormatParseError("Input string does not contain valid fence markers.", input);
      }
      return {
        content: onlyCandidate.content.trim(),
        fromFence: true,
      };
    }

    if (validCandidates.length === 1) {
      const onlyCandidate = validCandidates[0];
      if (onlyCandidate === undefined) {
        throw new FormatParseError(`No ${this.formatType} code block found.`, input);
      }
      return {
        content: onlyCandidate.content.trim(),
        fromFence: true,
      };
    }

    if (validCandidates.length > 1) {
      throw new FormatParseError("Multiple fenced blocks found. Expected exactly one.", input);
    }

    if (matches.length > 0) {
      if (matches.length === 1) {
        const onlyMatch = matches[0];
        if (onlyMatch === undefined) {
          throw new FormatParseError(`No ${this.formatType} code block found.`, input);
        }
        return {
          content: onlyMatch.content.trim(),
          fromFence: true,
        };
      }

      throw new FormatParseError(`No ${this.formatType} code block found.`, input);
    }

    return {
      content: input.trim(),
      fromFence: false,
    };
  }

  private addFences(content: string): string {
    return `\`\`\`${this.formatType}\n${content.trim()}\n\`\`\``;
  }

  private isValidLanguageTag(language: string | undefined): boolean {
    if (language === undefined) {
      return true;
    }

    const normalized = language.trim().toLowerCase();
    if (this.formatType === "json") {
      return normalized === "json";
    }

    return normalized === "yaml" || normalized === "yml";
  }
}

function normalizeFormatType(formatType: unknown): ParsedFormat {
  if (formatType === FormatType.YAML || formatType === "yaml" || formatType === "yml") {
    return "yaml";
  }

  return "json";
}

function parseExplicitFormatHandler(value: unknown): FormatHandler | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof FormatHandler) {
    return value;
  }

  if (!isRecord(value)) {
    throw new TypeError("Expected object for resolver_params.format_handler");
  }

  const formatType = value.formatType ?? value.format_type;
  const useWrapper = value.useWrapper ?? value.use_wrapper;
  const wrapperKey = value.wrapperKey ?? value.wrapper_key;
  const useFences = value.useFences ?? value.use_fences;
  const attributeSuffix = value.attributeSuffix ?? value.attribute_suffix;
  const strictFences = value.strictFences ?? value.strict_fences;
  const allowTopLevelList = value.allowTopLevelList ?? value.allow_top_level_list;

  if (useWrapper !== undefined && typeof useWrapper !== "boolean") {
    throw new TypeError("Expected boolean for resolver_params.format_handler.useWrapper");
  }
  if (wrapperKey !== undefined && wrapperKey !== null && typeof wrapperKey !== "string") {
    throw new TypeError("Expected string|null for resolver_params.format_handler.wrapperKey");
  }
  if (useFences !== undefined && typeof useFences !== "boolean") {
    throw new TypeError("Expected boolean for resolver_params.format_handler.useFences");
  }
  if (attributeSuffix !== undefined && typeof attributeSuffix !== "string") {
    throw new TypeError("Expected string for resolver_params.format_handler.attributeSuffix");
  }
  if (strictFences !== undefined && typeof strictFences !== "boolean") {
    throw new TypeError("Expected boolean for resolver_params.format_handler.strictFences");
  }
  if (allowTopLevelList !== undefined && typeof allowTopLevelList !== "boolean") {
    throw new TypeError("Expected boolean for resolver_params.format_handler.allowTopLevelList");
  }

  return new FormatHandler({
    ...(formatType !== undefined ? { formatType: normalizeFormatType(formatType) } : {}),
    ...(useWrapper !== undefined ? { useWrapper } : {}),
    ...(wrapperKey !== undefined ? { wrapperKey } : {}),
    ...(useFences !== undefined ? { useFences } : {}),
    ...(attributeSuffix !== undefined ? { attributeSuffix } : {}),
    ...(strictFences !== undefined ? { strictFences } : {}),
    ...(allowTopLevelList !== undefined ? { allowTopLevelList } : {}),
  });
}

function extractFencedBlocks(input: string): Array<{ language?: string; content: string }> {
  const blocks: Array<{ language?: string; content: string }> = [];
  FENCE_PATTERN.lastIndex = 0;

  let match = FENCE_PATTERN.exec(input);
  while (match !== null) {
    const language =
      typeof match[1] === "string" && match[1].trim().length > 0 ? match[1] : undefined;
    const content = match[2] ?? "";

    blocks.push({
      ...(language !== undefined ? { language } : {}),
      content,
    });

    match = FENCE_PATTERN.exec(input);
  }

  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseYaml(input: string): unknown {
  const parser = new MinimalYamlParser(input);
  return parser.parse();
}

interface YamlLine {
  indent: number;
  content: string;
}

class MinimalYamlParser {
  private readonly lines: YamlLine[];
  private index = 0;

  public constructor(input: string) {
    this.lines = toYamlLines(input);
  }

  public parse(): unknown {
    if (this.lines.length === 0) {
      throw new Error("Empty YAML input");
    }

    const value = this.parseBlock(this.lines[0]?.indent ?? 0);
    if (this.index < this.lines.length) {
      throw new Error("Trailing YAML content");
    }

    return value;
  }

  private parseBlock(indent: number): unknown {
    const current = this.current();
    if (current === undefined || current.indent < indent) {
      return null;
    }

    if (current.content.startsWith("- ")) {
      return this.parseSequence(indent);
    }

    return this.parseMapping(indent);
  }

  private parseSequence(indent: number): unknown[] {
    const values: unknown[] = [];

    while (this.index < this.lines.length) {
      const line = this.current();
      if (line === undefined || line.indent < indent || !line.content.startsWith("- ")) {
        break;
      }

      if (line.indent > indent) {
        throw new Error("Invalid sequence indentation");
      }

      const inline = line.content.slice(2).trim();
      this.index += 1;

      if (inline.length === 0) {
        values.push(this.parseBlock(indent + 2));
        continue;
      }

      const inlineEntry = splitKeyValue(inline);
      if (inlineEntry !== null) {
        const item: Record<string, unknown> = {};
        this.assignMappingValue(item, inlineEntry.key, inlineEntry.value, indent + 2);

        while (this.canParseMappingEntry(indent + 2)) {
          this.parseMappingEntry(item, indent + 2);
        }

        values.push(item);
        continue;
      }

      values.push(parseYamlScalar(inline));
    }

    return values;
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const mapping: Record<string, unknown> = {};

    while (this.index < this.lines.length) {
      const line = this.current();
      if (line === undefined || line.indent < indent || line.content.startsWith("- ")) {
        break;
      }

      if (line.indent > indent) {
        throw new Error("Invalid mapping indentation");
      }

      this.parseMappingEntry(mapping, indent);
    }

    return mapping;
  }

  private parseMappingEntry(target: Record<string, unknown>, indent: number): void {
    const line = this.current();
    if (line === undefined || line.indent !== indent) {
      throw new Error("Invalid mapping entry indentation");
    }

    const entry = splitKeyValue(line.content);
    if (entry === null) {
      throw new Error("Expected YAML key/value pair");
    }

    this.index += 1;
    this.assignMappingValue(target, entry.key, entry.value, indent + 2);
  }

  private assignMappingValue(
    target: Record<string, unknown>,
    key: string,
    rawValue: string,
    nestedIndent: number,
  ): void {
    if (rawValue.length > 0) {
      target[key] = parseYamlScalar(rawValue);
      return;
    }

    const next = this.current();
    if (next === undefined || next.indent < nestedIndent) {
      target[key] = null;
      return;
    }

    target[key] = this.parseBlock(nestedIndent);
  }

  private canParseMappingEntry(indent: number): boolean {
    const line = this.current();
    if (line === undefined) {
      return false;
    }

    return line.indent === indent && !line.content.startsWith("- ");
  }

  private current(): YamlLine | undefined {
    return this.lines[this.index];
  }
}

function toYamlLines(input: string): YamlLine[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const result: YamlLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    if (line.includes("\t")) {
      throw new Error("Tabs are not supported in YAML parser");
    }

    const indent = line.length - line.trimStart().length;
    result.push({
      indent,
      content: trimmed,
    });
  }

  return result;
}

function splitKeyValue(input: string): { key: string; value: string } | null {
  const separatorIndex = input.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = input.slice(0, separatorIndex).trim();
  if (key.length === 0) {
    return null;
  }

  const value = input.slice(separatorIndex + 1).trim();
  return {
    key,
    value,
  };
}

function parseYamlScalar(value: string): unknown {
  if (value === "null" || value === "~") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?[0-9]+(\.[0-9]+)?$/.test(value)) {
    const number = Number(value);
    if (!Number.isNaN(number)) {
      return number;
    }
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function stringifyYaml(value: unknown, indent = 0): string {
  const spacing = " ".repeat(indent);

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isRecord(item) || Array.isArray(item)) {
          const nested = stringifyYaml(item, indent + 2);
          return `${spacing}-\n${nested}`;
        }

        return `${spacing}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        if (isRecord(item) || Array.isArray(item)) {
          const nested = stringifyYaml(item, indent + 2);
          return `${spacing}${key}:\n${nested}`;
        }

        return `${spacing}${key}: ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  return `${spacing}${yamlScalar(value)}`;
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(String(value));
}
