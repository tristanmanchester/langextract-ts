import assert from "node:assert/strict";
import { test } from "vitest";

import {
  chunkBySentenceRanges,
  ChunkIterator,
  createTokenInterval,
  getCharInterval,
  getTokenIntervalText,
  makeBatchesOfTextChunk,
  SentenceIterator,
  TextChunk,
  TokenUtilError,
} from "../src/internal/chunking/index.js";
import { Document } from "../src/internal/core/data.js";
import {
  InvalidTokenIntervalError,
  RegexTokenizer,
  TokenType,
  tokenize,
} from "../src/internal/tokenizer/index.js";

void test("createTokenInterval validates index ordering and bounds", () => {
  assert.throws(() => createTokenInterval(-1, 1), /must be non-negative/i);
  assert.throws(() => createTokenInterval(2, 2), /must be < end index/i);

  const interval = createTokenInterval(1, 3);
  assert.deepEqual(interval, { startIndex: 1, endIndex: 3 });
});

void test("getTokenIntervalText and getCharInterval validate interval ranges", () => {
  const tokenized = tokenize("Alice in Berlin", new RegexTokenizer());

  assert.throws(
    () => getTokenIntervalText(tokenized, { startIndex: 2, endIndex: 2 }),
    /must be < end index/i,
  );

  assert.throws(
    () => getCharInterval(tokenized, { startIndex: 0, endIndex: 99 }),
    /out of bounds/i,
  );
});

void test("getTokenIntervalText throws TokenUtilError when token utility yields empty text", () => {
  const tokenized = {
    text: "abc",
    tokens: [
      {
        index: 0,
        tokenType: TokenType.WORD,
        charInterval: { startPos: 1, endPos: 1 },
        firstTokenAfterNewline: false,
      },
    ],
  };

  assert.throws(
    () => getTokenIntervalText(tokenized, { startIndex: 0, endIndex: 1 }),
    TokenUtilError,
  );
});

void test("TextChunk without document context throws when reading derived properties", () => {
  const chunk = new TextChunk({ startIndex: 0, endIndex: 1 });

  assert.throws(() => chunk.chunkText, /documentText must be set/i);
  assert.throws(() => chunk.charInterval, /documentText must be set/i);
});

void test("ChunkIterator requires text or document", () => {
  assert.throws(
    () => new ChunkIterator(undefined, 10, new RegexTokenizer()),
    /Either text or document must be provided/i,
  );
});

void test("ChunkIterator splits at newline boundaries when buffer is exceeded", () => {
  const text = "aaaa bbbb\ncccc dddd";
  const chunks = Array.from(new ChunkIterator(text, 9, new RegexTokenizer()));

  assert.deepEqual(
    chunks.map((chunk) => chunk.chunkText),
    ["aaaa bbbb", "cccc dddd"],
  );
});

void test("chunkBySentenceRanges can derive text from a provided document", () => {
  const document = new Document("One sentence. Two sentence.", { documentId: "doc-fixed" });

  const chunks = Array.from(
    chunkBySentenceRanges({
      text: undefined,
      maxCharBuffer: 50,
      tokenizer: new RegexTokenizer(),
      document,
    }),
  );

  assert.equal(chunks.length > 0, true);
  const firstChunk = chunks[0];
  assert.ok(firstChunk !== undefined);
  assert.equal(firstChunk.documentId, "doc-fixed");
  assert.equal(firstChunk.documentText?.text, "One sentence. Two sentence.");
});

void test("ChunkIterator re-tokenizes when provided tokenized input has no tokens", () => {
  const emptyTokenized = { text: "Fallback text", tokens: [] };

  const chunks = Array.from(new ChunkIterator(emptyTokenized, 100, new RegexTokenizer()));

  assert.equal(chunks.length, 1);
  const firstChunk = chunks[0];
  assert.ok(firstChunk !== undefined);
  assert.equal(firstChunk.chunkText, "Fallback text");
});

void test("SentenceIterator validates initial cursor bounds", () => {
  const tokenized = tokenize("Hello world.", new RegexTokenizer());

  assert.throws(() => new SentenceIterator(tokenized, -1), /cannot be negative/i);
  assert.throws(
    () => new SentenceIterator(tokenized, tokenized.tokens.length + 1),
    /exceeds token length/i,
  );
});

void test("makeBatchesOfTextChunk validates batchLength", () => {
  const chunks = Array.from(new ChunkIterator("Alice in Berlin", 100, new RegexTokenizer()));

  assert.throws(() => Array.from(makeBatchesOfTextChunk(chunks, 0)), /batchLength must be > 0/i);

  const batched = Array.from(makeBatchesOfTextChunk(chunks, 1));
  assert.deepEqual(
    batched.map((batch) => batch.length),
    chunks.map(() => 1),
  );
});

void test("getTokenIntervalText handles discontinuous token metadata by positional bounds", () => {
  const tokenized = {
    text: "zero one five",
    tokens: [
      {
        index: 0,
        tokenType: TokenType.WORD,
        charInterval: { startPos: 0, endPos: 4 },
        firstTokenAfterNewline: false,
      },
      {
        index: 1,
        tokenType: TokenType.WORD,
        charInterval: { startPos: 5, endPos: 8 },
        firstTokenAfterNewline: false,
      },
      {
        index: 5,
        tokenType: TokenType.WORD,
        charInterval: { startPos: 9, endPos: 13 },
        firstTokenAfterNewline: false,
      },
    ],
  };

  assert.equal(getTokenIntervalText(tokenized, { startIndex: 0, endIndex: 3 }), "zero one five");
  assert.throws(
    () => getTokenIntervalText(tokenized, { startIndex: 0, endIndex: 6 }),
    InvalidTokenIntervalError,
  );
});
