import { Document, type CharInterval } from "../core/data.js";
import { DEFAULT_TOKENIZER, findSentenceRange, tokensText } from "../tokenizer/tokenizer.js";
import type { TokenInterval } from "../core/types.js";
import type { TokenizedText, Tokenizer } from "../tokenizer/types.js";
import { TokenUtilError } from "./errors.js";

function createRangeError(message: string): Error {
  return new RangeError(message);
}

export function createTokenInterval(startIndex: number, endIndex: number): TokenInterval {
  if (startIndex < 0) {
    throw createRangeError(`Start index ${startIndex} must be non-negative.`);
  }
  if (startIndex >= endIndex) {
    throw createRangeError(`Start index ${startIndex} must be < end index ${endIndex}.`);
  }
  return { startIndex, endIndex };
}

export function getTokenIntervalText(
  tokenizedText: TokenizedText,
  tokenInterval: TokenInterval,
): string {
  if (tokenInterval.startIndex >= tokenInterval.endIndex) {
    throw createRangeError(
      `Start index ${tokenInterval.startIndex} must be < end index ${tokenInterval.endIndex}.`,
    );
  }

  const text = tokensText(tokenizedText, tokenInterval);
  if (tokenizedText.text.length > 0 && text.length === 0) {
    throw new TokenUtilError(
      "Token utility returned an empty string unexpectedly for a non-empty source text.",
    );
  }
  return text;
}

export function getCharInterval(
  tokenizedText: TokenizedText,
  tokenInterval: TokenInterval,
): CharInterval {
  if (tokenInterval.startIndex >= tokenInterval.endIndex) {
    throw createRangeError(
      `Start index ${tokenInterval.startIndex} must be < end index ${tokenInterval.endIndex}.`,
    );
  }

  const startToken = tokenizedText.tokens[tokenInterval.startIndex];
  const finalToken = tokenizedText.tokens[tokenInterval.endIndex - 1];
  if (!startToken || !finalToken) {
    throw createRangeError(
      `Token interval [${tokenInterval.startIndex}, ${tokenInterval.endIndex}) is out of bounds.`,
    );
  }

  return {
    startPos: startToken.charInterval.startPos,
    endPos: finalToken.charInterval.endPos,
  };
}

function sanitize(text: string): string {
  const sanitized = text.trim().replace(/\s+/g, " ");
  if (!sanitized) {
    throw new Error("Sanitized text is empty.");
  }
  return sanitized;
}

export class TextChunk {
  readonly tokenInterval: TokenInterval;
  readonly document: Document | undefined;
  private chunkTextCache: string | undefined;
  private sanitizedChunkTextCache: string | undefined;
  private charIntervalCache: CharInterval | undefined;

  constructor(tokenInterval: TokenInterval, document?: Document) {
    this.tokenInterval = tokenInterval;
    this.document = document;
  }

  get documentId(): string | undefined {
    return this.document?.documentId;
  }

  get documentText(): TokenizedText | undefined {
    return this.document?.tokenizedText;
  }

  get chunkText(): string {
    if (!this.documentText) {
      throw new Error("documentText must be set to access chunkText.");
    }
    if (!this.chunkTextCache) {
      this.chunkTextCache = getTokenIntervalText(this.documentText, this.tokenInterval);
    }
    return this.chunkTextCache;
  }

  get sanitizedChunkText(): string {
    if (!this.sanitizedChunkTextCache) {
      this.sanitizedChunkTextCache = sanitize(this.chunkText);
    }
    return this.sanitizedChunkTextCache;
  }

  get additionalContext(): string | undefined {
    return this.document?.additionalContext;
  }

  get charInterval(): CharInterval {
    if (!this.documentText) {
      throw new Error("documentText must be set to compute charInterval.");
    }
    if (!this.charIntervalCache) {
      this.charIntervalCache = getCharInterval(this.documentText, this.tokenInterval);
    }
    return this.charIntervalCache;
  }
}

export class SentenceIterator implements IterableIterator<TokenInterval> {
  private readonly tokenizedText: TokenizedText;
  private readonly tokenLength: number;
  private currentTokenPosition: number;

  constructor(tokenizedText: TokenizedText, currentTokenPosition = 0) {
    this.tokenizedText = tokenizedText;
    this.tokenLength = tokenizedText.tokens.length;

    if (currentTokenPosition < 0) {
      throw createRangeError(`Current token position ${currentTokenPosition} cannot be negative.`);
    }
    if (currentTokenPosition > this.tokenLength) {
      throw createRangeError(
        `Current token position ${currentTokenPosition} exceeds token length ${this.tokenLength}.`,
      );
    }
    this.currentTokenPosition = currentTokenPosition;
  }

  [Symbol.iterator](): IterableIterator<TokenInterval> {
    return this;
  }

  next(): IteratorResult<TokenInterval> {
    if (this.currentTokenPosition === this.tokenLength) {
      return { done: true, value: undefined };
    }

    const sentenceRange = findSentenceRange(
      this.tokenizedText.text,
      this.tokenizedText.tokens,
      this.currentTokenPosition,
    );
    const interval = createTokenInterval(this.currentTokenPosition, sentenceRange.endIndex);
    this.currentTokenPosition = interval.endIndex;
    return { done: false, value: interval };
  }
}

export class ChunkIterator implements IterableIterator<TextChunk> {
  private readonly tokenizedText: TokenizedText;
  private readonly maxCharBuffer: number;
  private sentenceIterator: SentenceIterator;
  private brokenSentence: boolean;
  private readonly document: Document;

  constructor(
    text: string | TokenizedText | undefined,
    maxCharBuffer: number,
    tokenizerImpl: Tokenizer = DEFAULT_TOKENIZER,
    document?: Document,
  ) {
    if (typeof text === "undefined" && !document) {
      throw new Error("Either text or document must be provided.");
    }

    let tokenizedText: TokenizedText;
    if (typeof text === "string") {
      tokenizedText = tokenizerImpl.tokenize(text);
    } else if (text && text.tokens.length > 0) {
      tokenizedText = text;
    } else {
      const sourceText = text?.text ?? document?.text ?? "";
      tokenizedText = tokenizerImpl.tokenize(sourceText);
    }

    this.tokenizedText = tokenizedText;
    this.maxCharBuffer = maxCharBuffer;
    this.sentenceIterator = new SentenceIterator(this.tokenizedText);
    this.brokenSentence = false;
    this.document = document ?? new Document(this.tokenizedText.text);
    this.document.tokenizedText = this.tokenizedText;
  }

  [Symbol.iterator](): IterableIterator<TextChunk> {
    return this;
  }

  next(): IteratorResult<TextChunk> {
    const firstSentenceResult = this.sentenceIterator.next();
    if (firstSentenceResult.done) {
      return { done: true, value: undefined };
    }

    const firstSentence = firstSentenceResult.value;
    let currentChunk = createTokenInterval(firstSentence.startIndex, firstSentence.startIndex + 1);
    if (this.tokensExceedBuffer(currentChunk)) {
      this.sentenceIterator = new SentenceIterator(
        this.tokenizedText,
        firstSentence.startIndex + 1,
      );
      this.brokenSentence = currentChunk.endIndex < firstSentence.endIndex;
      return { done: false, value: new TextChunk(currentChunk, this.document) };
    }

    let startOfNewLine = -1;
    for (
      let tokenIndex = currentChunk.startIndex;
      tokenIndex < firstSentence.endIndex;
      tokenIndex += 1
    ) {
      const token = this.tokenizedText.tokens[tokenIndex];
      if (token?.firstTokenAfterNewline) {
        startOfNewLine = tokenIndex;
      }

      const testChunk = createTokenInterval(currentChunk.startIndex, tokenIndex + 1);
      if (this.tokensExceedBuffer(testChunk)) {
        if (startOfNewLine > 0 && startOfNewLine > currentChunk.startIndex) {
          currentChunk = createTokenInterval(currentChunk.startIndex, startOfNewLine);
        }
        this.sentenceIterator = new SentenceIterator(this.tokenizedText, currentChunk.endIndex);
        this.brokenSentence = true;
        return { done: false, value: new TextChunk(currentChunk, this.document) };
      }
      currentChunk = testChunk;
    }

    if (this.brokenSentence) {
      this.brokenSentence = false;
      return { done: false, value: new TextChunk(currentChunk, this.document) };
    }

    let nextSentenceResult = this.sentenceIterator.next();
    while (!nextSentenceResult.done) {
      const sentence = nextSentenceResult.value;
      const testChunk = createTokenInterval(currentChunk.startIndex, sentence.endIndex);
      if (this.tokensExceedBuffer(testChunk)) {
        this.sentenceIterator = new SentenceIterator(this.tokenizedText, currentChunk.endIndex);
        return { done: false, value: new TextChunk(currentChunk, this.document) };
      }
      currentChunk = testChunk;
      nextSentenceResult = this.sentenceIterator.next();
    }

    return { done: false, value: new TextChunk(currentChunk, this.document) };
  }

  private tokensExceedBuffer(tokenInterval: TokenInterval): boolean {
    const interval = getCharInterval(this.tokenizedText, tokenInterval);
    return interval.endPos - interval.startPos > this.maxCharBuffer;
  }
}

export interface ChunkBySentenceRangesOptions {
  text: string | TokenizedText | undefined;
  maxCharBuffer: number;
  tokenizer?: Tokenizer;
  document?: Document;
}

export function chunkBySentenceRanges(
  options: ChunkBySentenceRangesOptions,
): IterableIterator<TextChunk> {
  return new ChunkIterator(
    options.text,
    options.maxCharBuffer,
    options.tokenizer ?? DEFAULT_TOKENIZER,
    options.document,
  );
}

export function* makeBatchesOfTextChunk(
  chunkIter: Iterable<TextChunk>,
  batchLength: number,
): IterableIterator<TextChunk[]> {
  if (!Number.isFinite(batchLength) || batchLength <= 0) {
    throw createRangeError(`batchLength must be > 0. Received: ${batchLength}.`);
  }

  let batch: TextChunk[] = [];
  for (const chunk of chunkIter) {
    batch.push(chunk);
    if (batch.length === batchLength) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield batch;
  }
}
