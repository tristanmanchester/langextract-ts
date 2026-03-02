import { tokenize } from "../tokenizer/tokenizer.js";
import type { TokenizedText } from "../tokenizer/types.js";
import type { CharInterval, TokenInterval } from "./types.js";
import { FormatType } from "./types.js";

export enum AlignmentStatus {
  MATCH_EXACT = "match_exact",
  MATCH_GREATER = "match_greater",
  MATCH_LESSER = "match_lesser",
  MATCH_FUZZY = "match_fuzzy",
}

export type ExtractionAttributes = Record<string, string | string[]>;

export interface ExtractionOptions {
  tokenInterval?: TokenInterval;
  charInterval?: CharInterval;
  alignmentStatus?: AlignmentStatus;
  extractionIndex?: number;
  groupIndex?: number;
  description?: string;
  attributes?: ExtractionAttributes;
}

export class Extraction {
  extractionClass: string;
  extractionText: string;
  charInterval: CharInterval | undefined;
  alignmentStatus: AlignmentStatus | undefined;
  extractionIndex: number | undefined;
  groupIndex: number | undefined;
  description: string | undefined;
  attributes: ExtractionAttributes | undefined;
  private _tokenInterval: TokenInterval | undefined;

  constructor(extractionClass: string, extractionText: string, options: ExtractionOptions = {}) {
    this.extractionClass = extractionClass;
    this.extractionText = extractionText;
    this._tokenInterval = options.tokenInterval;
    this.charInterval = options.charInterval;
    this.alignmentStatus = options.alignmentStatus;
    this.extractionIndex = options.extractionIndex;
    this.groupIndex = options.groupIndex;
    this.description = options.description;
    this.attributes = options.attributes;
  }

  get tokenInterval(): TokenInterval | undefined {
    return this._tokenInterval;
  }

  set tokenInterval(value: TokenInterval | undefined) {
    this._tokenInterval = value;
  }
}

function randomHex(bytes: number): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const buffer = new Uint8Array(bytes);
    webCrypto.getRandomValues(buffer);
    return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  let fallback = "";
  for (let index = 0; index < bytes; index += 1) {
    const value = Math.floor(Math.random() * 256);
    fallback += value.toString(16).padStart(2, "0");
  }
  return fallback;
}

export function generateDocumentId(): string {
  return `doc_${randomHex(4)}`;
}

export interface DocumentOptions {
  documentId?: string;
  additionalContext?: string;
}

export class Document {
  text: string;
  additionalContext: string | undefined;
  private _documentId: string | undefined;
  private _tokenizedText: TokenizedText | undefined;

  constructor(text: string, options: DocumentOptions = {}) {
    this.text = text;
    this.additionalContext = options.additionalContext;
    this._documentId = options.documentId;
  }

  get documentId(): string {
    if (!this._documentId) {
      this._documentId = generateDocumentId();
    }
    return this._documentId;
  }

  set documentId(value: string | undefined) {
    this._documentId = value;
  }

  get tokenizedText(): TokenizedText {
    if (!this._tokenizedText) {
      this._tokenizedText = tokenize(this.text);
    }
    return this._tokenizedText;
  }

  set tokenizedText(value: TokenizedText) {
    this._tokenizedText = value;
  }
}

export interface AnnotatedDocumentOptions {
  documentId?: string;
  extractions?: Extraction[];
  text?: string;
}

export class AnnotatedDocument {
  extractions: Extraction[] | undefined;
  text: string | undefined;
  private _documentId: string | undefined;
  private _tokenizedText: TokenizedText | undefined;

  constructor(options: AnnotatedDocumentOptions = {}) {
    this.extractions = options.extractions;
    this.text = options.text;
    this._documentId = options.documentId;
  }

  get documentId(): string {
    if (!this._documentId) {
      this._documentId = generateDocumentId();
    }
    return this._documentId;
  }

  set documentId(value: string | undefined) {
    this._documentId = value;
  }

  get tokenizedText(): TokenizedText | undefined {
    if (!this._tokenizedText && typeof this.text === "string") {
      this._tokenizedText = tokenize(this.text);
    }
    return this._tokenizedText;
  }

  set tokenizedText(value: TokenizedText) {
    this._tokenizedText = value;
  }
}

export class ExampleData {
  text: string;
  extractions: Extraction[];

  constructor(text: string, extractions: Extraction[] = []) {
    this.text = text;
    this.extractions = extractions;
  }
}

export { FormatType };
export type { CharInterval, TokenInterval };
