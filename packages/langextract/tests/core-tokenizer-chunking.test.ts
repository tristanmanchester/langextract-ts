import { describe, expect, it } from "vitest";
import {
  ChunkIterator,
  getTokenIntervalText,
  makeBatchesOfTextChunk,
} from "../src/internal/chunking/chunking.js";
import { Document } from "../src/internal/core/data.js";
import { TokenType } from "../src/internal/tokenizer/types.js";
import {
  RegexTokenizer,
  findSentenceRange,
  tokenize,
  tokensText,
} from "../src/internal/tokenizer/tokenizer.js";

describe("core models", () => {
  it("generates lazy document ids and caches tokenized text", () => {
    const doc = new Document("Hello world.");
    expect(doc.documentId).toMatch(/^doc_[0-9a-f]{8}$/);
    const firstTokenized = doc.tokenizedText;
    const secondTokenized = doc.tokenizedText;
    expect(firstTokenized).toBe(secondTokenized);
  });
});

describe("tokenizer helpers", () => {
  it("tokenizes and finds sentence ranges with abbreviation awareness", () => {
    const tokenized = tokenize("Dr. Bond asks.\nAnother line?");
    expect(tokenized.tokens[0]?.tokenType).toBe(TokenType.WORD);
    expect(tokenized.tokens[1]?.tokenType).toBe(TokenType.PUNCTUATION);

    const firstSentence = findSentenceRange(tokenized.text, tokenized.tokens, 0);
    expect(firstSentence).toEqual({ startIndex: 0, endIndex: 5 });
    expect(tokensText(tokenized, firstSentence)).toBe("Dr. Bond asks.");

    const secondSentence = findSentenceRange(
      tokenized.text,
      tokenized.tokens,
      firstSentence.endIndex,
    );
    expect(secondSentence).toEqual({ startIndex: 5, endIndex: 8 });
    expect(tokensText(tokenized, secondSentence)).toBe("Another line?");
  });
});

describe("chunking", () => {
  it("splits text by maxCharBuffer and maps intervals to chunk text", () => {
    const text = "This is a sentence. This is a longer sentence. Mr. Bond\nasks\nwhy?";
    const tokenized = tokenize(text, new RegexTokenizer());
    const chunks = Array.from(new ChunkIterator(tokenized, 12, new RegexTokenizer()));
    const chunkTexts = chunks.map((chunk) => chunk.chunkText);

    expect(chunkTexts).toEqual([
      "This is a",
      "sentence.",
      "This is a",
      "longer",
      "sentence.",
      "Mr. Bond",
      "asks\nwhy?",
    ]);

    for (const chunk of chunks) {
      expect(getTokenIntervalText(tokenized, chunk.tokenInterval)).toBe(chunk.chunkText);
    }

    const batches = Array.from(makeBatchesOfTextChunk(chunks, 3));
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 1]);
  });
});
