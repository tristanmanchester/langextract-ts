import type { CharInterval, TokenInterval } from "../core/types.js";

export enum TokenType {
  WORD = 0,
  NUMBER = 1,
  PUNCTUATION = 2,
}

export interface Token {
  index: number;
  tokenType: TokenType;
  charInterval: CharInterval;
  firstTokenAfterNewline: boolean;
}

export interface TokenizedText {
  text: string;
  tokens: Token[];
}

export interface Tokenizer {
  tokenize(text: string): TokenizedText;
}

export type { TokenInterval };
