import assert from "node:assert/strict";
import { test } from "vitest";

import {
  PromptAlignmentError,
  PromptValidationError,
  buildContextAwarePrompt,
  handleAlignmentReport,
  renderPromptTemplate,
  enforcePromptValidation,
  validatePrompt,
  validatePromptAlignment,
} from "../src/internal/prompting/index.js";

void test("renderPromptTemplate interpolates all variables", () => {
  const prompt = renderPromptTemplate("Hello {{name}}", { name: "Tristan" });
  assert.equal(prompt, "Hello Tristan");
});

void test("validatePrompt flags unresolved template variables", () => {
  const report = validatePrompt("Use {{text}} and return JSON", { level: "warn" });
  assert.equal(report.valid, false);
  assert.equal(
    report.issues.some((issue) => issue.code === "unresolved-template-variable"),
    true,
  );
});

void test("enforcePromptValidation throws at error level", () => {
  assert.throws(
    () => {
      enforcePromptValidation("", { level: "error" });
    },
    (error: unknown) => error instanceof PromptValidationError,
  );
});

void test("buildContextAwarePrompt injects context and questions", () => {
  const prompt = buildContextAwarePrompt({
    text: "Alice moved to Berlin.",
    context: "Focus on entities.",
    questions: ["Who moved?", "Where did they move?"],
    schema: [
      { label: "person", description: "A human name" },
      { label: "location", description: "A city or place" },
    ],
  });

  assert.match(prompt, /Focus on entities\./);
  assert.match(prompt, /Who moved\?/);
  assert.match(prompt, /return JSON/i);
});

void test("validatePromptAlignment reports failed and non-exact matches", () => {
  const report = validatePromptAlignment([
    {
      text: "Patient takes lisinopril.",
      extractions: [{ extractionClass: "Medication", extractionText: "metformin" }],
    },
    {
      text: "Type 2 diabetes.",
      extractions: [{ extractionClass: "Diagnosis", extractionText: "type-2 diabetes" }],
    },
  ]);

  assert.equal(report.hasFailed, true);
  assert.equal(report.hasNonExact, true);
  assert.equal(report.issues.length, 2);
});

void test("handleAlignmentReport throws in strict error mode", () => {
  const report = validatePromptAlignment([
    {
      text: "Type 2 diabetes.",
      extractions: [{ extractionClass: "Diagnosis", extractionText: "type-2 diabetes" }],
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
    (error: unknown) => error instanceof PromptAlignmentError,
  );
});
