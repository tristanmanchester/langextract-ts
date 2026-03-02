import assert from "node:assert/strict";
import { test } from "vitest";

import {
  findSentenceRange,
  InvalidTokenIntervalError,
  RegexTokenizer,
  SentenceRangeError,
  TokenType,
  tokenize,
  tokensText,
  type TokenizedText,
  type Tokenizer,
} from "../src/internal/tokenizer/index.js";

void test("tokenize delegates to custom tokenizer implementations", () => {
  const output: TokenizedText = {
    text: "custom",
    tokens: [
      {
        index: 0,
        tokenType: TokenType.WORD,
        charInterval: { startPos: 0, endPos: 6 },
        firstTokenAfterNewline: false,
      },
    ],
  };

  const customTokenizer: Tokenizer = {
    tokenize() {
      return output;
    },
  };

  const result = tokenize("ignored", customTokenizer);
  assert.equal(result, output);
});

void test("RegexTokenizer marks first token after CRLF newlines", () => {
  const tokenized = tokenize("One.\r\nTwo", new RegexTokenizer());

  const token = tokenized.tokens[2];
  assert.ok(token !== undefined);
  assert.equal(token.tokenType, TokenType.WORD);
  assert.equal(token.firstTokenAfterNewline, true);
});

void test("findSentenceRange throws on invalid start indices", () => {
  const tokenized = tokenize("Hello world.");

  assert.throws(
    () => findSentenceRange(tokenized.text, tokenized.tokens, tokenized.tokens.length),
    SentenceRangeError,
  );
});

void test("findSentenceRange includes trailing closing punctuation", () => {
  const tokenized = tokenize('He said "Stop!" Next.');
  const range = findSentenceRange(tokenized.text, tokenized.tokens, 0);

  assert.equal(tokensText(tokenized, range), 'He said "Stop!"');
});

void test("findSentenceRange newline break only triggers for non-lowercase continuation", () => {
  const tokenized = tokenize("First line\nand continues", new RegexTokenizer());
  const range = findSentenceRange(tokenized.text, tokenized.tokens, 0);

  assert.equal(range.endIndex, tokenized.tokens.length);
  assert.equal(tokensText(tokenized, range), "First line\nand continues");
});

void test("tokensText supports empty intervals", () => {
  const tokenized = tokenize("Hello world");

  const text = tokensText(tokenized, { startIndex: 1, endIndex: 1 });
  assert.equal(text, "");
});

void test("tokensText rejects invalid token intervals", () => {
  const tokenized = tokenize("Hello world");

  assert.throws(
    () => tokensText(tokenized, { startIndex: -1, endIndex: 1 }),
    InvalidTokenIntervalError,
  );
  assert.throws(
    () => tokensText(tokenized, { startIndex: 2, endIndex: 1 }),
    InvalidTokenIntervalError,
  );
});

void test("findSentenceRange honors custom abbreviation sets", () => {
  const tokenized = tokenize("Dr. Smith arrived.");

  const defaultRange = findSentenceRange(tokenized.text, tokenized.tokens, 0);
  assert.equal(tokensText(tokenized, defaultRange), "Dr. Smith arrived.");

  const noAbbreviationRange = findSentenceRange(tokenized.text, tokenized.tokens, 0, new Set());
  assert.equal(tokensText(tokenized, noAbbreviationRange), "Dr.");
});
