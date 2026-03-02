import assert from "node:assert/strict";
import { test } from "vitest";

import {
  PromptAlignmentError,
  enforcePromptValidation,
  handleAlignmentReport,
  validatePrompt,
  validatePromptAlignment,
} from "../src/internal/prompting/index.js";

void test("validatePrompt level=off short-circuits all checks", () => {
  const report = validatePrompt("{{missing}} without JSON", {
    level: "off",
    maxCharacters: 1,
  });

  assert.deepEqual(report, {
    level: "off",
    valid: true,
    issues: [],
  });
});

void test("validatePrompt can disable JSON-instruction requirement", () => {
  const report = validatePrompt("This prompt has no explicit format.", {
    level: "warn",
    requireJsonInstruction: false,
  });

  assert.equal(report.valid, true);
  assert.equal(report.issues.length, 0);
});

void test("enforcePromptValidation returns reports in warn mode without throwing", () => {
  const report = enforcePromptValidation("", {
    level: "warn",
    requireJsonInstruction: false,
  });

  assert.equal(report.valid, false);
  assert.equal(
    report.issues.some((issue) => issue.code === "empty-prompt"),
    true,
  );
});

void test("validatePromptAlignment handles empty example list", () => {
  const report = validatePromptAlignment([]);

  assert.deepEqual(report, {
    issues: [],
    hasFailed: false,
    hasNonExact: false,
  });
});

void test("validatePromptAlignment policy can force failed issues instead of non-exact", () => {
  const report = validatePromptAlignment(
    [
      {
        text: "Open AI builds models.",
        extractions: [{ extractionClass: "organization", extractionText: "openai" }],
      },
    ],
    {
      acceptMatchLesser: false,
      enableFuzzyAlignment: false,
    },
  );

  assert.equal(report.hasFailed, true);
  assert.equal(report.hasNonExact, false);
  assert.equal(report.issues.length, 1);
  const firstIssue = report.issues[0];
  assert.ok(firstIssue !== undefined);
  assert.equal(firstIssue.issueKind, "failed");
  assert.equal(firstIssue.alignmentStatus, null);
});

void test("handleAlignmentReport level=off does not emit warnings", () => {
  const report = validatePromptAlignment([
    {
      text: "Open AI builds models.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ]);

  let warningCount = 0;
  handleAlignmentReport(report, {
    level: "off",
    onWarning() {
      warningCount += 1;
    },
  });

  assert.equal(warningCount, 0);
});

void test("handleAlignmentReport uses console.warn when callback is omitted", () => {
  const report = validatePromptAlignment([
    {
      text: "Open AI builds models.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ]);

  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown, ...rest: unknown[]) => {
    warnings.push([message, ...rest].map((item) => String(item)).join(" "));
  };

  try {
    handleAlignmentReport(report, { level: "warn" });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /Prompt alignment: non-exact match/i);
});

void test("handleAlignmentReport throws PromptAlignmentError for strict non-exact mode", () => {
  const report = validatePromptAlignment([
    {
      text: "Open AI builds models.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ]);

  assert.throws(
    () => {
      handleAlignmentReport(report, {
        level: "error",
        strictNonExact: true,
        onWarning: () => undefined,
      });
    },
    (error: unknown) =>
      error instanceof PromptAlignmentError &&
      /strict mode/i.test(error.message) &&
      error.report.hasNonExact,
  );
});

void test("validatePromptAlignment does not mutate input examples", () => {
  const examples = [
    {
      text: "Open AI builds models.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ] as const;
  const before = JSON.parse(JSON.stringify(examples));

  const report = validatePromptAlignment(examples);

  assert.equal(report.issues.length, 1);
  assert.deepEqual(examples, before);
});

void test("validatePromptAlignment returns issues in deterministic example/extraction order", () => {
  const report = validatePromptAlignment([
    {
      exampleId: "e2",
      text: "Type 2 diabetes is chronic.",
      extractions: [
        { extractionClass: "condition", extractionText: "type-2 diabetes" },
        { extractionClass: "missing", extractionText: "not present" },
      ],
    },
    {
      exampleId: "e3",
      text: "Open AI builds models.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ]);

  assert.equal(report.issues.length, 3);
  assert.equal(report.issues[0].exampleId, "e2");
  assert.equal(report.issues[0].extractionClass, "condition");
  assert.equal(report.issues[1].exampleId, "e2");
  assert.equal(report.issues[1].extractionClass, "missing");
  assert.equal(report.issues[2].exampleId, "e3");
  assert.equal(report.issues[2].extractionClass, "organization");
});
