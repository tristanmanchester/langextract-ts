import { generateText } from "ai";
import { chunkBySentenceRanges } from "../chunking/chunking.js";
import { Document as CoreDocument } from "../core/data.js";
import type { FormatType } from "../core/data.js";
import { InferenceRuntimeError, InvalidDocumentError } from "../core/errors.js";
import { createResolverFromResolverParams } from "../resolver/resolver.js";
import type { Resolver } from "../resolver/resolver.js";
import {
  buildContextAwarePrompt,
  enforcePromptValidation,
  type ContextAwarePromptOptions,
  type PromptSchemaField,
  type PromptValidationLevel,
  type PromptValidationReport,
} from "../prompting/index.js";
import type { AISDKModelSettings, LangextractModel, ModelCandidate } from "../providers/types.js";
import type { ResolvedExtraction } from "../resolver/types.js";
import type { Tokenizer } from "../tokenizer/types.js";

export interface InputDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface AnnotatedExtraction extends ResolvedExtraction {
  documentId: string;
  pass: number;
}

export interface AnnotatedDocument {
  document: InputDocument;
  extractions: AnnotatedExtraction[];
  promptValidationReports: PromptValidationReport[];
}

export interface ModelCallEvent {
  provider: string;
  modelId: string;
  attempt: number;
  fallbackUsed: boolean;
  passIndex: number;
  chunkIndex: number;
  documentId: string;
  durationMs: number;
  success: boolean;
  errorName?: string;
  errorMessage?: string;
  usage?: unknown;
  promptChars?: number;
  outputChars?: number;
  promptPreview?: string;
  outputPreview?: string;
}

export interface ProgressUpdateEvent {
  completedChunks: number;
  totalChunks: number;
  processedChars: number;
  totalChars: number;
  passIndex: number;
  chunkIndex: number;
  documentId: string;
}

export interface AnnotatorPipelineOptions {
  model: LangextractModel;
  resolver?: Resolver;
  batchSize?: number;
  passes?: number;
  maxWorkers?: number;
  maxCharBuffer?: number;
  contextWindowChars?: number;
  settings?: AISDKModelSettings;
  context?: string;
  questions?: readonly string[];
  schema?: readonly PromptSchemaField[];
  formatType?: FormatType | "none";
  fenceOutput?: boolean;
  useSchemaConstraints?: boolean;
  examples?: readonly {
    text: string;
    extractions: readonly {
      extractionClass: string;
      extractionText: string;
      attributes?: Record<string, unknown>;
    }[];
  }[];
  resolverParams?: Record<string, unknown>;
  promptTemplate?: string;
  promptDescription?: string;
  promptValidationLevel?: PromptValidationLevel;
  promptLintLevel?: PromptValidationLevel;
  promptValidationStrict?: boolean;
  promptValidationMaxCharacters?: number;
  tokenizer?: Tokenizer;
  showProgress?: boolean;
  debug?: boolean;
  promptBuilder?: (options: ContextAwarePromptOptions) => string;
  onModelCall?: (event: ModelCallEvent) => void;
  onProgress?: (event: ProgressUpdateEvent) => void;
}

interface SingleDocumentResult {
  extractions: AnnotatedExtraction[];
  validationReports: PromptValidationReport[];
}

interface ChunkWorkItem {
  document: InputDocument;
  chunkText: string;
  charOffset: number;
  chunkContext?: string;
}

const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_PASSES = 1;
const DEFAULT_MAX_WORKERS = 10;
const DEFAULT_MAX_CHAR_BUFFER = 1_000;
const RETRIABLE_STATUS_CODES = new Set([404, 408, 409, 425, 429, 500, 502, 503, 504]);

export class AnnotatorPipeline {
  private readonly options: AnnotatorPipelineOptions;
  private readonly resolver: Resolver;

  public constructor(options: AnnotatorPipelineOptions) {
    this.options = options;
    this.resolver =
      options.resolver ??
      createResolverFromResolverParams({
        ...(options.resolverParams !== undefined ? { resolverParams: options.resolverParams } : {}),
        baseFormatType: resolveResolverBaseFormatType(options.formatType),
        baseUseFences: options.fenceOutput ?? true,
      }).resolver;
  }

  public async annotateText(document: InputDocument): Promise<AnnotatedDocument> {
    const [annotated] = await this.annotateDocuments([document]);
    if (annotated === undefined) {
      throw new Error("Failed to annotate input text.");
    }

    return annotated;
  }

  public async annotateDocuments(
    documents: readonly InputDocument[],
  ): Promise<AnnotatedDocument[]> {
    const batchSize = Math.max(1, Math.floor(this.options.batchSize ?? DEFAULT_BATCH_SIZE));
    const passes = Math.max(1, Math.floor(this.options.passes ?? DEFAULT_PASSES));
    const maxWorkers = Math.max(1, Math.floor(this.options.maxWorkers ?? DEFAULT_MAX_WORKERS));
    const maxCharBuffer = Math.max(
      1,
      Math.floor(this.options.maxCharBuffer ?? DEFAULT_MAX_CHAR_BUFFER),
    );
    const contextWindowChars =
      this.options.contextWindowChars !== undefined
        ? Math.max(0, Math.floor(this.options.contextWindowChars))
        : undefined;

    const resultMap = new Map<string, AnnotatedDocument>();
    const visitedDocumentIds = new Set<string>();
    for (const document of documents) {
      if (visitedDocumentIds.has(document.id)) {
        throw new InvalidDocumentError(`Duplicate document id: ${document.id}`);
      }
      visitedDocumentIds.add(document.id);
      resultMap.set(document.id, {
        document,
        extractions: [],
        promptValidationReports: [],
      });
    }

    const workItems = buildChunkWorkItems(
      documents,
      maxCharBuffer,
      contextWindowChars,
      this.options.tokenizer,
    );
    const totalChunksPerPass = workItems.length;
    const totalChunks = totalChunksPerPass * passes;
    const totalCharsPerPass = workItems.reduce((sum, item) => sum + item.chunkText.length, 0);
    const totalChars = totalCharsPerPass * passes;
    let completedChunks = 0;
    let processedChars = 0;

    for (let pass = 0; pass < passes; pass += 1) {
      const batches = chunkDocuments(workItems, batchSize);
      for (const [batchIndex, batch] of batches.entries()) {
        const batchOffset = batchIndex * batchSize;
        const batchResults = await mapWithConcurrency(
          batch,
          maxWorkers,
          async (
            workItem,
            indexInBatch,
          ): Promise<{ workItem: ChunkWorkItem } & SingleDocumentResult> => {
            const singleResult = await this.annotateChunk(
              workItem,
              pass,
              batchOffset + indexInBatch,
            );
            return {
              workItem,
              ...singleResult,
            };
          },
        );

        for (const [indexInBatch, item] of batchResults.entries()) {
          const current = resultMap.get(item.workItem.document.id);
          if (current === undefined) {
            continue;
          }

          current.promptValidationReports.push(...item.validationReports);
          current.extractions = mergeExtractions(current.extractions, item.extractions);
          completedChunks += 1;
          processedChars += item.workItem.chunkText.length;
          emitProgress(this.options, {
            completedChunks,
            totalChunks,
            processedChars,
            totalChars,
            passIndex: pass,
            chunkIndex: batchOffset + indexInBatch,
            documentId: item.workItem.document.id,
          });
        }
      }
    }

    return documents
      .map((document) => resultMap.get(document.id))
      .filter((result): result is AnnotatedDocument => result !== undefined);
  }

  private async annotateChunk(
    workItem: ChunkWorkItem,
    pass: number,
    chunkIndex: number,
  ): Promise<SingleDocumentResult> {
    const prompt = this.buildPrompt(workItem.chunkText, workItem.chunkContext);
    const promptLintLevel = this.options.promptLintLevel ?? "off";
    const validationReport = enforcePromptValidation(prompt, {
      level: promptLintLevel,
      ...(this.options.promptValidationMaxCharacters !== undefined
        ? { maxCharacters: this.options.promptValidationMaxCharacters }
        : {}),
      requireJsonInstruction: this.options.formatType !== "none",
    });

    const output = await this.generateWithFallback(prompt, {
      passIndex: pass,
      chunkIndex,
      documentId: workItem.document.id,
    });

    const resolved = this.resolver.resolve({
      sourceText: workItem.chunkText,
      modelOutput: output,
    });

    return {
      extractions: resolved.map((extraction) => ({
        ...extraction,
        start: extraction.start >= 0 ? extraction.start + workItem.charOffset : extraction.start,
        end: extraction.end >= 0 ? extraction.end + workItem.charOffset : extraction.end,
        documentId: workItem.document.id,
        pass,
      })),
      validationReports: [validationReport],
    };
  }

  private async generateWithFallback(
    prompt: string,
    eventContext: {
      passIndex: number;
      chunkIndex: number;
      documentId: string;
    },
  ): Promise<string> {
    const candidates = [toCandidate(this.options.model), ...this.options.model.fallbackModels];

    let lastError: unknown;

    for (const [index, candidate] of candidates.entries()) {
      const startedAtMs = Date.now();
      try {
        const request: Parameters<typeof generateText>[0] = {
          model: candidate.model,
          prompt,
        };
        applyGenerateTextSettings(request, this.options.settings);

        const response = await generateText(request);

        this.options.onModelCall?.({
          provider: candidate.provider,
          modelId: candidate.modelId,
          attempt: index + 1,
          fallbackUsed: index > 0,
          passIndex: eventContext.passIndex,
          chunkIndex: eventContext.chunkIndex,
          documentId: eventContext.documentId,
          durationMs: Date.now() - startedAtMs,
          success: true,
          usage: response.usage,
          ...buildDebugEventMetadata(this.options.debug ?? false, prompt, response.text),
        });

        return response.text;
      } catch (error) {
        lastError = error;
        const normalizedError = normalizeError(error);
        this.options.onModelCall?.({
          provider: candidate.provider,
          modelId: candidate.modelId,
          attempt: index + 1,
          fallbackUsed: index > 0,
          passIndex: eventContext.passIndex,
          chunkIndex: eventContext.chunkIndex,
          documentId: eventContext.documentId,
          durationMs: Date.now() - startedAtMs,
          success: false,
          errorName: normalizedError.name,
          errorMessage: normalizedError.message,
          ...buildDebugEventMetadata(this.options.debug ?? false, prompt),
        });

        const isLastCandidate = index === candidates.length - 1;
        if (isLastCandidate || !shouldRetryWithFallback(error)) {
          throw new InferenceRuntimeError(
            `Model call failed for ${candidate.provider}:${candidate.modelId}. ${normalizedError.message}`,
            {
              provider: candidate.provider,
              original: normalizedError,
            },
          );
        }
      }
    }

    throw new InferenceRuntimeError("Model call failed for all configured routes.", {
      provider: this.options.model.provider,
      original: normalizeError(lastError),
    });
  }

  private buildPrompt(text: string, chunkContext?: string): string {
    const promptBuilder = this.options.promptBuilder ?? buildContextAwarePrompt;
    const composedContext = composeContext(this.options.context, chunkContext);
    return promptBuilder({
      text,
      ...(composedContext !== undefined ? { context: composedContext } : {}),
      ...(this.options.formatType !== undefined ? { outputFormat: this.options.formatType } : {}),
      ...(this.options.questions !== undefined ? { questions: this.options.questions } : {}),
      ...(this.options.schema !== undefined ? { schema: this.options.schema } : {}),
      ...(this.options.promptTemplate !== undefined
        ? { promptTemplate: this.options.promptTemplate }
        : {}),
      ...(this.options.promptDescription !== undefined
        ? { promptDescription: this.options.promptDescription }
        : {}),
    });
  }
}

function resolveResolverBaseFormatType(
  formatType: AnnotatorPipelineOptions["formatType"],
): FormatType | "json" | "yaml" {
  if (formatType === "none") {
    return "json";
  }

  return formatType ?? "json";
}

function toCandidate(model: LangextractModel): ModelCandidate {
  return {
    provider: model.provider,
    modelId: model.modelId,
    model: model.model,
  };
}

function applyGenerateTextSettings(
  request: Parameters<typeof generateText>[0],
  settings: AISDKModelSettings | undefined,
): void {
  if (settings === undefined) {
    return;
  }

  if (settings.temperature !== undefined) {
    request.temperature = settings.temperature;
  }
  if (settings.topP !== undefined) {
    request.topP = settings.topP;
  }
  if (settings.topK !== undefined) {
    request.topK = settings.topK;
  }
  if (settings.maxOutputTokens !== undefined) {
    request.maxOutputTokens = settings.maxOutputTokens;
  }
  if (settings.frequencyPenalty !== undefined) {
    request.frequencyPenalty = settings.frequencyPenalty;
  }
  if (settings.presencePenalty !== undefined) {
    request.presencePenalty = settings.presencePenalty;
  }
  if (settings.stopSequences !== undefined) {
    request.stopSequences = [...settings.stopSequences];
  }
  if (settings.seed !== undefined) {
    request.seed = settings.seed;
  }
  if (settings.timeout !== undefined) {
    request.timeout = settings.timeout;
  }
  if (settings.maxRetries !== undefined) {
    request.maxRetries = settings.maxRetries;
  }
  if (settings.headers !== undefined) {
    request.headers = settings.headers;
  }
  if (settings.providerOptions !== undefined) {
    request.providerOptions = settings.providerOptions as never;
  }
}

function shouldRetryWithFallback(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as Record<string, unknown>;
  const statusCode = record.statusCode;
  if (typeof statusCode === "number") {
    return RETRIABLE_STATUS_CODES.has(statusCode);
  }

  const message = record.message;
  if (typeof message === "string") {
    return /deprecated|not found|temporar|unavailable|rate limit|overload/i.test(message);
  }

  return false;
}

function normalizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactErrorMessage(error.message),
    };
  }

  return {
    name: "UnknownError",
    message: redactErrorMessage(String(error)),
  };
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi, "$1[REDACTED]")
    .slice(0, 600);
}

function buildChunkWorkItems(
  documents: readonly InputDocument[],
  maxCharBuffer: number,
  contextWindowChars: number | undefined,
  tokenizer: Tokenizer | undefined,
): ChunkWorkItem[] {
  const workItems: ChunkWorkItem[] = [];

  for (const document of documents) {
    const additionalContext = readAdditionalContextFromDocument(document);
    const coreDocument = new CoreDocument(document.text, {
      documentId: document.id,
      ...(additionalContext !== undefined ? { additionalContext } : {}),
    });

    const chunks = Array.from(
      chunkBySentenceRanges({
        text: coreDocument.text,
        maxCharBuffer,
        ...(tokenizer !== undefined ? { tokenizer } : {}),
        document: coreDocument,
      }),
    );

    if (chunks.length === 0) {
      workItems.push({
        document,
        chunkText: document.text,
        charOffset: 0,
        ...(additionalContext !== undefined ? { chunkContext: additionalContext } : {}),
      });
      continue;
    }

    let previousChunkText: string | undefined;
    for (const chunk of chunks) {
      const windowContext = createContextWindow(previousChunkText, contextWindowChars);
      const chunkContext = composeContext(additionalContext, windowContext);
      workItems.push({
        document,
        chunkText: chunk.chunkText,
        charOffset: chunk.charInterval.startPos,
        ...(chunkContext !== undefined ? { chunkContext } : {}),
      });
      previousChunkText = chunk.chunkText;
    }
  }

  return workItems;
}

function readAdditionalContextFromDocument(document: InputDocument): string | undefined {
  const value = document.metadata?.additionalContext;
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function createContextWindow(
  previousChunkText: string | undefined,
  contextWindowChars: number | undefined,
): string | undefined {
  if (
    previousChunkText === undefined ||
    contextWindowChars === undefined ||
    contextWindowChars <= 0
  ) {
    return undefined;
  }

  const tail = previousChunkText.slice(-contextWindowChars).trim();
  if (tail.length === 0) {
    return undefined;
  }

  return `Previous chunk context:\n${tail}`;
}

function composeContext(
  primary: string | undefined,
  secondary: string | undefined,
): string | undefined {
  const segments = [primary, secondary].filter(
    (segment): segment is string => typeof segment === "string" && segment.trim().length > 0,
  );
  if (segments.length === 0) {
    return undefined;
  }

  return segments.join("\n\n");
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      const item = items[index];
      if (item === undefined) {
        continue;
      }

      results[index] = await mapper(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}

function chunkDocuments<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function emitProgress(options: AnnotatorPipelineOptions, event: ProgressUpdateEvent): void {
  if (options.showProgress === false) {
    return;
  }

  if (options.onProgress !== undefined) {
    options.onProgress(event);
    return;
  }

  if (!shouldRenderTtyProgress()) {
    return;
  }

  const line = `LangExtract: ${event.completedChunks}/${event.totalChunks} chunks (${event.processedChars}/${event.totalChars} chars)`;
  const suffix = event.completedChunks >= event.totalChunks ? "\n" : "\r";
  process.stderr.write(line + suffix);
}

function shouldRenderTtyProgress(): boolean {
  if (process.env.CI === "true") {
    return false;
  }

  return process.stderr.isTTY === true;
}

function buildDebugEventMetadata(
  debug: boolean,
  prompt: string,
  output?: string,
): Pick<ModelCallEvent, "promptChars" | "outputChars" | "promptPreview" | "outputPreview"> {
  if (!debug) {
    return {};
  }

  return {
    promptChars: prompt.length,
    ...(output !== undefined ? { outputChars: output.length } : {}),
    promptPreview: truncateDebugPreview(prompt),
    ...(output !== undefined ? { outputPreview: truncateDebugPreview(output) } : {}),
  };
}

function truncateDebugPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}

function mergeExtractions(
  existing: readonly AnnotatedExtraction[],
  incoming: readonly AnnotatedExtraction[],
): AnnotatedExtraction[] {
  const merged = new Map<string, AnnotatedExtraction>();

  for (const extraction of existing) {
    const key = `${extraction.documentId}:${extraction.label}:${extraction.start}:${extraction.end}:${extraction.text}`;
    merged.set(key, extraction);
  }

  for (const extraction of incoming) {
    if (isOverlappingWithEarlierPass(extraction, merged.values())) {
      continue;
    }

    const key = `${extraction.documentId}:${extraction.label}:${extraction.start}:${extraction.end}:${extraction.text}`;
    const current = merged.get(key);
    if (current === undefined) {
      merged.set(key, extraction);
      continue;
    }

    merged.set(key, pickPreferredExtraction(current, extraction));
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }

    if (a.end !== b.end) {
      return a.end - b.end;
    }

    return a.label.localeCompare(b.label);
  });
}

function isOverlappingWithEarlierPass(
  extraction: AnnotatedExtraction,
  existing: Iterable<AnnotatedExtraction>,
): boolean {
  if (extraction.start < 0 || extraction.end <= extraction.start) {
    return false;
  }

  for (const item of existing) {
    if (item.pass >= extraction.pass) {
      continue;
    }
    if (item.start < 0 || item.end <= item.start) {
      continue;
    }
    if (item.start < extraction.end && extraction.start < item.end) {
      return true;
    }
  }

  return false;
}

function pickPreferredExtraction(
  a: AnnotatedExtraction,
  b: AnnotatedExtraction,
): AnnotatedExtraction {
  const alignmentScoreA = alignmentRank(a);
  const alignmentScoreB = alignmentRank(b);
  if (alignmentScoreA !== alignmentScoreB) {
    return alignmentScoreA > alignmentScoreB ? a : b;
  }

  const confidenceA = a.confidence ?? 0;
  const confidenceB = b.confidence ?? 0;
  if (confidenceA !== confidenceB) {
    return confidenceA > confidenceB ? a : b;
  }

  return a.pass <= b.pass ? a : b;
}

function alignmentRank(extraction: AnnotatedExtraction): number {
  switch (extraction.alignmentStatus) {
    case "exact":
      return 3;
    case "lesser":
      return 2;
    case "fuzzy":
      return 1;
    default:
      return 0;
  }
}
