import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DEFAULT_EXTRACTION_TEMPLATE,
  PromptTemplateError,
  buildContextAwarePrompt,
  buildQAPrompt,
  renderPromptTemplate,
  validatePrompt,
} from "../src/internal/prompting/index.js";

void test("buildQAPrompt supports YAML output and trims input fields", () => {
  const prompt = buildQAPrompt({
    question: "  What city?  ",
    context: "  Alice moved to Berlin.  ",
    outputFormat: "yaml",
  });

  assert.match(prompt, /Return YAML in this shape:/);
  assert.match(prompt, /answer: <short answer>/);
  assert.match(prompt, /What city\?/);
  assert.match(prompt, /Alice moved to Berlin\./);
});

void test("buildContextAwarePrompt uses default schema and context when omitted", () => {
  const prompt = buildContextAwarePrompt({ text: "Alice moved to Berlin." });

  assert.match(prompt, /No additional context provided\./);
  assert.match(prompt, /No fixed schema provided\./);
  assert.match(prompt, /Extract high-value structured information\./);
  assert.match(prompt, /Alice moved to Berlin\./);
});

void test("buildContextAwarePrompt falls back to template when single question is blank", () => {
  const prompt = buildContextAwarePrompt({
    text: "Alice moved to Berlin.",
    questions: ["   "],
  });

  assert.match(prompt, /Questions:/);
  assert.doesNotMatch(prompt, /Answer the question using only the provided context\./);
});

void test("renderPromptTemplate replaces repeated variables", () => {
  const template = "{{word}}/{{word}}/{{other}}";
  const rendered = renderPromptTemplate(template, {
    word: "alpha",
    other: "beta",
  });

  assert.equal(rendered, "alpha/alpha/beta");
});

void test("renderPromptTemplate throws PromptTemplateError with sorted missing names", () => {
  assert.throws(
    () => {
      renderPromptTemplate("{{b}} {{a}}", { b: "ok" });
    },
    (error: unknown) => {
      assert.ok(error instanceof PromptTemplateError);
      assert.match(error.message, /"a"/);
      return true;
    },
  );
});

void test("validatePrompt can skip JSON instruction requirement", () => {
  const report = validatePrompt("Summarize the passage.", {
    level: "warn",
    requireJsonInstruction: false,
  });

  assert.equal(report.valid, true);
  assert.equal(report.issues.length, 0);
});

void test("default extraction template keeps stable placeholders", () => {
  assert.match(DEFAULT_EXTRACTION_TEMPLATE, /\{\{promptDescription\}\}/);
  assert.match(DEFAULT_EXTRACTION_TEMPLATE, /\{\{inputText\}\}/);
  assert.match(DEFAULT_EXTRACTION_TEMPLATE, /\{\{outputInstructions\}\}/);
});

void test("buildContextAwarePrompt supports non-structured output mode", () => {
  const prompt = buildContextAwarePrompt({
    text: "Alice moved to Berlin.",
    outputFormat: "none",
  });

  assert.match(prompt, /without enforcing JSON or YAML formatting/i);
  assert.doesNotMatch(prompt, /Return JSON only in this shape:/);
});

void test("buildContextAwarePrompt single-question mode does not force JSON in none mode", () => {
  const prompt = buildContextAwarePrompt({
    text: "Alice moved to Berlin.",
    questions: ["Where did Alice move?"],
    outputFormat: "none",
  });

  assert.match(prompt, /Return a concise plain-text answer\./);
  assert.doesNotMatch(prompt, /Return JSON in this shape:/);
});
