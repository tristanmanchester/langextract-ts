import { WordAligner } from "../resolver/word-aligner.js";

export type PromptValidationLevel = "off" | "warn" | "error";

export type PromptValidationIssueCode =
  | "empty-prompt"
  | "too-long"
  | "unresolved-template-variable"
  | "missing-json-instruction";

export interface PromptValidationIssue {
  code: PromptValidationIssueCode;
  message: string;
}

export interface PromptValidationReport {
  level: PromptValidationLevel;
  valid: boolean;
  issues: PromptValidationIssue[];
}

export interface PromptValidationOptions {
  level?: PromptValidationLevel;
  maxCharacters?: number;
  requireJsonInstruction?: boolean;
}

export interface PromptAlignmentExample {
  text: string;
  exampleId?: string;
  extractions: readonly {
    extractionClass: string;
    extractionText: string;
  }[];
}

export type PromptAlignmentIssueKind = "failed" | "non_exact";

export interface PromptAlignmentIssue {
  exampleIndex: number;
  exampleId?: string;
  extractionClass: string;
  extractionTextPreview: string;
  alignmentStatus: "exact" | "lesser" | "fuzzy" | null;
  issueKind: PromptAlignmentIssueKind;
  charInterval?: [number, number];
}

export interface PromptAlignmentReport {
  issues: PromptAlignmentIssue[];
  hasFailed: boolean;
  hasNonExact: boolean;
}

export interface AlignmentPolicy {
  enableFuzzyAlignment?: boolean;
  fuzzyAlignmentThreshold?: number;
  acceptMatchLesser?: boolean;
}

export interface HandleAlignmentReportOptions {
  level: PromptValidationLevel;
  strictNonExact?: boolean;
  onWarning?: (message: string, issue: PromptAlignmentIssue) => void;
}

export class PromptValidationError extends Error {
  public readonly report: PromptValidationReport;

  public constructor(report: PromptValidationReport) {
    super(formatValidationError(report));
    this.name = "PromptValidationError";
    this.report = report;
  }
}

export class PromptAlignmentError extends Error {
  public readonly report: PromptAlignmentReport;

  public constructor(message: string, report: PromptAlignmentReport) {
    super(message);
    this.name = "PromptAlignmentError";
    this.report = report;
  }
}

const DEFAULT_MAX_CHARACTERS = 12_000;

export function validatePrompt(
  prompt: string,
  options: PromptValidationOptions = {},
): PromptValidationReport {
  const level = options.level ?? "error";

  if (level === "off") {
    return {
      level,
      valid: true,
      issues: [],
    };
  }

  const issues: PromptValidationIssue[] = [];
  const normalized = prompt.trim();

  if (normalized.length === 0) {
    issues.push({
      code: "empty-prompt",
      message: "Prompt cannot be empty.",
    });
  }

  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  if (normalized.length > maxCharacters) {
    issues.push({
      code: "too-long",
      message: `Prompt exceeds maxCharacters (${maxCharacters}).`,
    });
  }

  if (/{{\s*[A-Za-z0-9_]+\s*}}/.test(prompt)) {
    issues.push({
      code: "unresolved-template-variable",
      message: "Prompt still contains unresolved template variables.",
    });
  }

  const requireJsonInstruction = options.requireJsonInstruction ?? true;
  if (requireJsonInstruction && !/json/i.test(prompt)) {
    issues.push({
      code: "missing-json-instruction",
      message: "Prompt should explicitly ask for JSON output.",
    });
  }

  return {
    level,
    valid: issues.length === 0,
    issues,
  };
}

export function enforcePromptValidation(
  prompt: string,
  options: PromptValidationOptions = {},
): PromptValidationReport {
  const report = validatePrompt(prompt, options);
  if (!report.valid && report.level === "error") {
    throw new PromptValidationError(report);
  }

  return report;
}

export function validatePromptAlignment(
  examples: readonly PromptAlignmentExample[],
  policy: AlignmentPolicy = {},
): PromptAlignmentReport {
  if (examples.length === 0) {
    return {
      issues: [],
      hasFailed: false,
      hasNonExact: false,
    };
  }

  const aligner = new WordAligner({
    ...(policy.fuzzyAlignmentThreshold !== undefined
      ? { fuzzyThreshold: policy.fuzzyAlignmentThreshold }
      : {}),
  });

  const issues: PromptAlignmentIssue[] = [];
  for (const [exampleIndex, example] of examples.entries()) {
    for (const extraction of example.extractions) {
      const text = extraction.extractionText;
      const alignment = aligner.align(example.text, text, {
        ...(policy.enableFuzzyAlignment !== undefined
          ? { enableFuzzyAlignment: policy.enableFuzzyAlignment }
          : {}),
        ...(policy.fuzzyAlignmentThreshold !== undefined
          ? { fuzzyAlignmentThreshold: policy.fuzzyAlignmentThreshold }
          : {}),
        ...(policy.acceptMatchLesser !== undefined
          ? { acceptMatchLesser: policy.acceptMatchLesser }
          : {}),
      });

      if (alignment.start < 0 || alignment.end <= alignment.start) {
        issues.push({
          exampleIndex,
          ...(example.exampleId !== undefined ? { exampleId: example.exampleId } : {}),
          extractionClass: extraction.extractionClass,
          extractionTextPreview: preview(text),
          alignmentStatus: null,
          issueKind: "failed",
        });
        continue;
      }

      if (alignment.status === "lesser" || alignment.status === "fuzzy") {
        issues.push({
          exampleIndex,
          ...(example.exampleId !== undefined ? { exampleId: example.exampleId } : {}),
          extractionClass: extraction.extractionClass,
          extractionTextPreview: preview(text),
          alignmentStatus: alignment.status,
          issueKind: "non_exact",
          charInterval: [alignment.start, alignment.end],
        });
      }
    }
  }

  return {
    issues,
    hasFailed: issues.some((issue) => issue.issueKind === "failed"),
    hasNonExact: issues.some((issue) => issue.issueKind === "non_exact"),
  };
}

export function handleAlignmentReport(
  report: PromptAlignmentReport,
  options: HandleAlignmentReportOptions,
): void {
  if (options.level === "off") {
    return;
  }

  for (const issue of report.issues) {
    const message =
      issue.issueKind === "non_exact"
        ? `Prompt alignment: non-exact match: ${formatIssue(issue)}`
        : `Prompt alignment: failed to align: ${formatIssue(issue)}`;

    if (options.onWarning !== undefined) {
      options.onWarning(message, issue);
    } else {
      console.warn(message);
    }
  }

  if (options.level !== "error") {
    return;
  }

  if (report.hasFailed) {
    const failed = report.issues.find((issue) => issue.issueKind === "failed");
    const sample = failed !== undefined ? formatIssue(failed) : "unknown issue";
    throw new PromptAlignmentError(
      `Prompt alignment validation failed: ${report.issues.filter((issue) => issue.issueKind === "failed").length} extraction(s) could not be aligned (e.g., ${sample})`,
      report,
    );
  }

  if (options.strictNonExact && report.hasNonExact) {
    const nonExact = report.issues.find((issue) => issue.issueKind === "non_exact");
    const sample = nonExact !== undefined ? formatIssue(nonExact) : "unknown issue";
    throw new PromptAlignmentError(
      `Prompt alignment validation failed under strict mode: ${report.issues.filter((issue) => issue.issueKind === "non_exact").length} non-exact match(es) found (e.g., ${sample})`,
      report,
    );
  }
}

function preview(value: string, maxLength = 120): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength - 1)}…`;
}

function formatIssue(issue: PromptAlignmentIssue): string {
  const exampleId = issue.exampleId !== undefined ? ` id=${issue.exampleId}` : "";
  const span =
    issue.charInterval !== undefined
      ? ` char_span=(${issue.charInterval[0]}, ${issue.charInterval[1]})`
      : "";
  return `[example#${issue.exampleIndex}${exampleId}] class='${issue.extractionClass}' status=${issue.alignmentStatus} text='${issue.extractionTextPreview}'${span}`;
}

function formatValidationError(report: PromptValidationReport): string {
  const header = "Prompt validation failed:";
  const details = report.issues.map((issue) => `- ${issue.code}: ${issue.message}`);
  return [header, ...details].join("\n");
}
