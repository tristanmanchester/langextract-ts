import { LangExtractError } from "../core/errors.js";

export class BaseTokenizerError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    this.name = "BaseTokenizerError";
  }
}

export class InvalidTokenIntervalError extends BaseTokenizerError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenIntervalError";
  }
}

export class SentenceRangeError extends BaseTokenizerError {
  constructor(message: string) {
    super(message);
    this.name = "SentenceRangeError";
  }
}
