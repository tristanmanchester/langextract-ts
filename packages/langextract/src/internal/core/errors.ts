function initError(instance: Error, name: string): void {
  instance.name = name;
}

export class LangExtractError extends Error {
  constructor(message?: string) {
    super(message);
    initError(this, "LangExtractError");
  }
}

export class InferenceError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "InferenceError");
  }
}

export class InferenceConfigError extends InferenceError {
  constructor(message?: string) {
    super(message);
    initError(this, "InferenceConfigError");
  }
}

export interface InferenceRuntimeErrorOptions {
  original?: unknown;
  provider?: string;
}

export class InferenceRuntimeError extends InferenceError {
  readonly original: unknown | undefined;
  readonly provider: string | undefined;

  constructor(message: string, options: InferenceRuntimeErrorOptions = {}) {
    super(message);
    initError(this, "InferenceRuntimeError");
    this.original = options.original;
    this.provider = options.provider;
  }
}

export class InferenceOutputError extends LangExtractError {
  constructor(message: string) {
    super(message);
    initError(this, "InferenceOutputError");
  }
}

export class InvalidDocumentError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "InvalidDocumentError");
  }
}

export class InternalError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "InternalError");
  }
}

export class ProviderError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "ProviderError");
  }
}

export class SchemaError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "SchemaError");
  }
}

export class FormatError extends LangExtractError {
  constructor(message?: string) {
    super(message);
    initError(this, "FormatError");
  }
}

export class FormatParseError extends FormatError {
  constructor(message?: string) {
    super(message);
    initError(this, "FormatParseError");
  }
}
