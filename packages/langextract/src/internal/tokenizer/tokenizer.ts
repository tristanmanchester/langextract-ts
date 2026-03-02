import type { TokenInterval } from "../core/types.js";
import { InvalidTokenIntervalError, SentenceRangeError } from "./errors.js";
import { TokenType, type Token, type TokenizedText, type Tokenizer } from "./types.js";

const LETTERS_PATTERN = "[\\p{L}\\p{M}]+";
const DIGITS_PATTERN = "\\p{N}+";
const SYMBOLS_PATTERN = "([^\\p{L}\\p{N}\\s]|_)\\1*";

const TOKEN_PATTERN = new RegExp(`${LETTERS_PATTERN}|${DIGITS_PATTERN}|${SYMBOLS_PATTERN}`, "gu");
const DIGITS_REGEX = new RegExp(`^${DIGITS_PATTERN}$`, "u");
const WORD_REGEX = new RegExp(`^(?:${LETTERS_PATTERN}|${DIGITS_PATTERN})$`, "u");
const END_OF_SENTENCE_PATTERN = /[.?!\u3002\uFF01\uFF1F\u0964]["'\u201D\u2019\u00BB)\]}]*$/u;
const KNOWN_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "St.",
]);
const CLOSING_PUNCTUATION: ReadonlySet<string> = new Set([
  '"',
  "'",
  "\u201D",
  "\u2019",
  "\u00BB",
  ")",
  "]",
  "}",
]);

export class RegexTokenizer implements Tokenizer {
  tokenize(text: string): TokenizedText {
    const tokens: Token[] = [];
    let previousEnd = 0;

    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const matchedText = match[0];
      const startPos = match.index;
      const endPos = startPos + matchedText.length;

      let tokenType = TokenType.PUNCTUATION;
      if (DIGITS_REGEX.test(matchedText)) {
        tokenType = TokenType.NUMBER;
      } else if (WORD_REGEX.test(matchedText)) {
        tokenType = TokenType.WORD;
      }

      let firstTokenAfterNewline = false;
      if (tokens.length > 0) {
        const gap = text.slice(previousEnd, startPos);
        firstTokenAfterNewline = gap.includes("\n") || gap.includes("\r");
      }

      tokens.push({
        index: tokens.length,
        tokenType,
        charInterval: {
          startPos,
          endPos,
        },
        firstTokenAfterNewline,
      });
      previousEnd = endPos;
    }

    return { text, tokens };
  }
}

export const DEFAULT_TOKENIZER: Tokenizer = new RegexTokenizer();

export function tokenize(text: string, tokenizer: Tokenizer = DEFAULT_TOKENIZER): TokenizedText {
  return tokenizer.tokenize(text);
}

export function tokensText(tokenizedText: TokenizedText, tokenInterval: TokenInterval): string {
  if (tokenInterval.startIndex === tokenInterval.endIndex) {
    return "";
  }

  if (
    tokenInterval.startIndex < 0 ||
    tokenInterval.endIndex > tokenizedText.tokens.length ||
    tokenInterval.startIndex > tokenInterval.endIndex
  ) {
    throw new InvalidTokenIntervalError(
      `Invalid token interval. startIndex=${tokenInterval.startIndex}, ` +
        `endIndex=${tokenInterval.endIndex}, totalTokens=${tokenizedText.tokens.length}.`,
    );
  }

  const startToken = tokenizedText.tokens[tokenInterval.startIndex];
  const endToken = tokenizedText.tokens[tokenInterval.endIndex - 1];
  if (!startToken || !endToken) {
    throw new InvalidTokenIntervalError(
      `Token interval out of bounds. startIndex=${tokenInterval.startIndex}, ` +
        `endIndex=${tokenInterval.endIndex}, totalTokens=${tokenizedText.tokens.length}.`,
    );
  }

  return tokenizedText.text.slice(startToken.charInterval.startPos, endToken.charInterval.endPos);
}

function tokenText(text: string, token: Token): string {
  return text.slice(token.charInterval.startPos, token.charInterval.endPos);
}

function isEndOfSentenceToken(
  text: string,
  tokens: readonly Token[],
  currentIndex: number,
  knownAbbreviations: ReadonlySet<string>,
): boolean {
  const current = tokens[currentIndex];
  if (!current) {
    return false;
  }

  const currentTokenText = tokenText(text, current);
  if (!END_OF_SENTENCE_PATTERN.test(currentTokenText)) {
    return false;
  }

  if (currentIndex > 0) {
    const prevToken = tokens[currentIndex - 1];
    if (prevToken) {
      const prevTokenText = tokenText(text, prevToken);
      if (knownAbbreviations.has(`${prevTokenText}${currentTokenText}`)) {
        return false;
      }
    }
  }

  return true;
}

function isLowercaseLetter(char: string): boolean {
  return char.toLocaleLowerCase() === char && char.toLocaleUpperCase() !== char;
}

function isSentenceBreakAfterNewline(
  text: string,
  tokens: readonly Token[],
  currentIndex: number,
): boolean {
  if (currentIndex + 1 >= tokens.length) {
    return false;
  }

  const nextToken = tokens[currentIndex + 1];
  if (!nextToken || !nextToken.firstTokenAfterNewline) {
    return false;
  }

  const nextTokenText = tokenText(text, nextToken);
  const firstChar = nextTokenText[0];
  if (!firstChar) {
    return false;
  }

  return !isLowercaseLetter(firstChar);
}

export function findSentenceRange(
  text: string,
  tokens: readonly Token[],
  startTokenIndex: number,
  knownAbbreviations: ReadonlySet<string> = KNOWN_ABBREVIATIONS,
): TokenInterval {
  if (tokens.length === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  if (startTokenIndex < 0 || startTokenIndex >= tokens.length) {
    throw new SentenceRangeError(
      `startTokenIndex=${startTokenIndex} out of range. Total tokens: ${tokens.length}.`,
    );
  }

  for (let index = startTokenIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      break;
    }

    if (token.tokenType === TokenType.PUNCTUATION) {
      if (isEndOfSentenceToken(text, tokens, index, knownAbbreviations)) {
        let endIndex = index + 1;
        while (endIndex < tokens.length) {
          const trailingToken = tokens[endIndex];
          if (!trailingToken || trailingToken.tokenType !== TokenType.PUNCTUATION) {
            break;
          }

          const trailingText = tokenText(text, trailingToken);
          if (CLOSING_PUNCTUATION.has(trailingText)) {
            endIndex += 1;
            continue;
          }
          break;
        }

        return { startIndex: startTokenIndex, endIndex };
      }
    }

    if (isSentenceBreakAfterNewline(text, tokens, index)) {
      return { startIndex: startTokenIndex, endIndex: index + 1 };
    }
  }

  return { startIndex: startTokenIndex, endIndex: tokens.length };
}
