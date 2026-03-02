export type AlignmentStatus = "exact" | "lesser" | "fuzzy";

export interface WordAlignment {
  status: AlignmentStatus;
  start: number;
  end: number;
  text: string;
  score: number;
}

export interface RawExtraction {
  text?: string;
  value?: string;
  snippet?: string;
  span?: string;
  label?: string;
  category?: string;
  type?: string;
  start?: number | string;
  end?: number | string;
  confidence?: number | string;
  [key: string]: unknown;
}

export interface ResolvedExtraction {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence?: number;
  alignmentStatus: AlignmentStatus;
  alignmentScore: number;
  raw: RawExtraction;
}

export interface ResolveInput {
  sourceText: string;
  modelOutput: string;
  suppressParseErrors?: boolean;
  enableFuzzyAlignment?: boolean;
  fuzzyAlignmentThreshold?: number;
  acceptMatchLesser?: boolean;
}
