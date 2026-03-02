import type { WordAlignment } from "./types.js";

interface IndexedWord {
  word: string;
  start: number;
  end: number;
}

export interface WordAlignerOptions {
  fuzzyThreshold?: number;
}

export interface AlignInputOptions {
  hintStart?: number;
  hintEnd?: number;
  enableFuzzyAlignment?: boolean;
  fuzzyAlignmentThreshold?: number;
  acceptMatchLesser?: boolean;
}

const DEFAULT_FUZZY_THRESHOLD = 0.75;

export class WordAligner {
  private readonly fuzzyThreshold: number;

  public constructor(options: WordAlignerOptions = {}) {
    this.fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
  }

  public align(
    sourceText: string,
    excerpt: string,
    options: AlignInputOptions = {},
  ): WordAlignment {
    const cleanedExcerpt = excerpt.trim();
    if (cleanedExcerpt.length === 0) {
      return {
        status: "fuzzy",
        start: -1,
        end: -1,
        text: "",
        score: 0,
      };
    }

    const acceptMatchLesser = options.acceptMatchLesser ?? true;
    const fuzzyAlignmentThreshold = options.fuzzyAlignmentThreshold ?? this.fuzzyThreshold;
    const enableFuzzyAlignment = options.enableFuzzyAlignment ?? true;

    const hintAlignment = this.tryHintAlignment(sourceText, cleanedExcerpt, {
      ...(options.hintStart !== undefined ? { hintStart: options.hintStart } : {}),
      ...(options.hintEnd !== undefined ? { hintEnd: options.hintEnd } : {}),
      acceptMatchLesser,
      fuzzyAlignmentThreshold,
      enableFuzzyAlignment,
    });
    if (hintAlignment !== null) {
      return hintAlignment;
    }

    const exactIndex = sourceText.indexOf(cleanedExcerpt);
    if (exactIndex >= 0) {
      return {
        status: "exact",
        start: exactIndex,
        end: exactIndex + cleanedExcerpt.length,
        text: sourceText.slice(exactIndex, exactIndex + cleanedExcerpt.length),
        score: 1,
      };
    }

    const caseInsensitiveExactIndex = sourceText
      .toLowerCase()
      .indexOf(cleanedExcerpt.toLowerCase());
    if (caseInsensitiveExactIndex >= 0) {
      return {
        status: "exact",
        start: caseInsensitiveExactIndex,
        end: caseInsensitiveExactIndex + cleanedExcerpt.length,
        text: sourceText.slice(
          caseInsensitiveExactIndex,
          caseInsensitiveExactIndex + cleanedExcerpt.length,
        ),
        score: 1,
      };
    }

    if (acceptMatchLesser) {
      const lesserAlignment = this.findNormalizedLesserAlignment(sourceText, cleanedExcerpt);
      if (lesserAlignment !== null) {
        return lesserAlignment;
      }
    }

    if (enableFuzzyAlignment) {
      const fuzzyAlignment = this.findFuzzyAlignment(
        sourceText,
        cleanedExcerpt,
        fuzzyAlignmentThreshold,
      );
      if (fuzzyAlignment !== null) {
        return fuzzyAlignment;
      }
    }

    return {
      status: "fuzzy",
      start: -1,
      end: -1,
      text: cleanedExcerpt,
      score: 0,
    };
  }

  private tryHintAlignment(
    sourceText: string,
    excerpt: string,
    options: {
      hintStart?: number;
      hintEnd?: number;
      acceptMatchLesser: boolean;
      fuzzyAlignmentThreshold: number;
      enableFuzzyAlignment: boolean;
    },
  ): WordAlignment | null {
    const { hintStart, hintEnd } = options;

    if (
      typeof hintStart !== "number" ||
      typeof hintEnd !== "number" ||
      !Number.isInteger(hintStart) ||
      !Number.isInteger(hintEnd)
    ) {
      return null;
    }

    if (hintStart < 0 || hintEnd <= hintStart || hintEnd > sourceText.length) {
      return null;
    }

    const hintedText = sourceText.slice(hintStart, hintEnd);
    if (hintedText === excerpt) {
      return {
        status: "exact",
        start: hintStart,
        end: hintEnd,
        text: hintedText,
        score: 1,
      };
    }

    if (options.acceptMatchLesser && hintedText.toLowerCase() === excerpt.toLowerCase()) {
      return {
        status: "exact",
        start: hintStart,
        end: hintEnd,
        text: hintedText,
        score: 1,
      };
    }

    if (
      options.acceptMatchLesser &&
      normalizeSearchText(hintedText).normalized === normalizeSearchText(excerpt).normalized
    ) {
      return {
        status: "lesser",
        start: hintStart,
        end: hintEnd,
        text: hintedText,
        score: 0.95,
      };
    }

    if (options.enableFuzzyAlignment) {
      const score = tokenOverlapScore(splitWords(excerpt), splitWords(hintedText));
      if (score >= options.fuzzyAlignmentThreshold) {
        return {
          status: "fuzzy",
          start: hintStart,
          end: hintEnd,
          text: hintedText,
          score,
        };
      }
    }

    return null;
  }

  private findNormalizedLesserAlignment(sourceText: string, excerpt: string): WordAlignment | null {
    const normalizedSource = normalizeSearchText(sourceText);
    const normalizedExcerpt = normalizeSearchText(excerpt).normalized;
    if (normalizedExcerpt.length === 0 || normalizedSource.normalized.length === 0) {
      return null;
    }

    const normalizedIndex = normalizedSource.normalized.indexOf(normalizedExcerpt);
    if (normalizedIndex < 0) {
      return null;
    }

    const start = normalizedSource.indexMap[normalizedIndex];
    const endIndexInNormalized = normalizedIndex + normalizedExcerpt.length - 1;
    const endInclusive = normalizedSource.indexMap[endIndexInNormalized];
    if (start === undefined || endInclusive === undefined) {
      return null;
    }

    return {
      status: "lesser",
      start,
      end: endInclusive + 1,
      text: sourceText.slice(start, endInclusive + 1),
      score: 0.95,
    };
  }

  private findFuzzyAlignment(
    sourceText: string,
    excerpt: string,
    fuzzyAlignmentThreshold: number,
  ): WordAlignment | null {
    const sourceWords = indexWords(sourceText);
    const excerptWords = splitWords(excerpt);
    if (sourceWords.length === 0 || excerptWords.length === 0) {
      return null;
    }

    const minWindowSize = Math.max(1, excerptWords.length - 2);
    const maxWindowSize = Math.min(sourceWords.length, excerptWords.length + 2);

    let bestCandidate: WordAlignment | null = null;

    for (let startIndex = 0; startIndex < sourceWords.length; startIndex += 1) {
      for (let length = minWindowSize; length <= maxWindowSize; length += 1) {
        const endWordIndex = startIndex + length;
        if (endWordIndex > sourceWords.length) {
          continue;
        }

        const words = sourceWords.slice(startIndex, endWordIndex);
        const score = tokenOverlapScore(
          excerptWords,
          words.map((word) => word.word),
        );

        if (score < fuzzyAlignmentThreshold) {
          continue;
        }

        const candidateStart = words[0]?.start;
        const lastWord = words.at(-1);
        if (typeof candidateStart !== "number" || typeof lastWord?.end !== "number") {
          continue;
        }

        const candidate: WordAlignment = {
          status: "fuzzy",
          start: candidateStart,
          end: lastWord.end,
          text: sourceText.slice(candidateStart, lastWord.end),
          score,
        };

        if (bestCandidate === null || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
      }
    }

    return bestCandidate;
  }
}

function indexWords(text: string): IndexedWord[] {
  const wordPattern = /[A-Za-z0-9]+/g;
  const words: IndexedWord[] = [];

  let match = wordPattern.exec(text);
  while (match !== null) {
    const matchedWord = match[0];
    const word = normalizeToken(matchedWord);
    const start = match.index;
    words.push({
      word,
      start,
      end: start + matchedWord.length,
    });
    match = wordPattern.exec(text);
  }

  return words;
}

function splitWords(text: string): string[] {
  const words = text.match(/[A-Za-z0-9]+/g);
  if (words === null) {
    return [];
  }

  return words.map((word) => normalizeToken(word));
}

function normalizeToken(token: string): string {
  let normalized = token.toLowerCase();
  if (normalized.length > 3 && normalized.endsWith("s") && !normalized.endsWith("ss")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function normalizeSearchText(text: string): { normalized: string; indexMap: number[] } {
  let normalized = "";
  const indexMap: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined || /[A-Za-z0-9]/.test(char) === false) {
      continue;
    }

    normalized += char.toLowerCase();
    indexMap.push(index);
  }

  return {
    normalized,
    indexMap,
  };
}

function tokenOverlapScore(tokensA: readonly string[], tokensB: readonly string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const tokenCounts = new Map<string, number>();
  for (const token of tokensA) {
    const current = tokenCounts.get(token) ?? 0;
    tokenCounts.set(token, current + 1);
  }

  let overlap = 0;
  for (const token of tokensB) {
    const current = tokenCounts.get(token) ?? 0;
    if (current > 0) {
      overlap += 1;
      tokenCounts.set(token, current - 1);
    }
  }

  return overlap / Math.max(tokensA.length, tokensB.length);
}
