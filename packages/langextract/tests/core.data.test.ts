import assert from "node:assert/strict";
import { test } from "vitest";

import {
  AlignmentStatus,
  AnnotatedDocument,
  Document,
  ExampleData,
  Extraction,
  generateDocumentId,
} from "../src/internal/core/data.js";

void test("Extraction stores optional metadata and supports tokenInterval setter", () => {
  const extraction = new Extraction("person", "Alice", {
    tokenInterval: { startIndex: 0, endIndex: 1 },
    charInterval: { startPos: 0, endPos: 5 },
    alignmentStatus: AlignmentStatus.MATCH_EXACT,
    extractionIndex: 1,
    groupIndex: 0,
    description: "entity",
    attributes: { source: "manual", tags: ["seed"] },
  });

  assert.equal(extraction.extractionClass, "person");
  assert.equal(extraction.extractionText, "Alice");
  assert.deepEqual(extraction.tokenInterval, { startIndex: 0, endIndex: 1 });
  assert.deepEqual(extraction.charInterval, { startPos: 0, endPos: 5 });
  assert.equal(extraction.alignmentStatus, AlignmentStatus.MATCH_EXACT);
  assert.equal(extraction.extractionIndex, 1);
  assert.equal(extraction.groupIndex, 0);
  assert.equal(extraction.description, "entity");
  assert.deepEqual(extraction.attributes, { source: "manual", tags: ["seed"] });

  extraction.tokenInterval = { startIndex: 1, endIndex: 2 };
  assert.deepEqual(extraction.tokenInterval, { startIndex: 1, endIndex: 2 });
});

void test("Document supports explicit id/context and token cache override", () => {
  const document = new Document("Alice moved.", {
    documentId: "doc-fixed",
    additionalContext: "custom context",
  });

  assert.equal(document.documentId, "doc-fixed");
  assert.equal(document.additionalContext, "custom context");

  const tokenized = document.tokenizedText;
  assert.equal(tokenized.text, "Alice moved.");

  document.tokenizedText = { text: "override", tokens: [] };
  assert.equal(document.tokenizedText.text, "override");

  document.documentId = undefined;
  assert.match(document.documentId, /^doc_[0-9a-f]{8}$/);
});

void test("AnnotatedDocument lazily tokenizes when text exists", () => {
  const annotated = new AnnotatedDocument({ text: "Alice in Berlin" });

  assert.match(annotated.documentId, /^doc_[0-9a-f]{8}$/);
  const tokenized = annotated.tokenizedText;
  assert.ok(tokenized !== undefined);
  assert.equal(tokenized.text, "Alice in Berlin");

  annotated.tokenizedText = { text: "manual", tokens: [] };
  const overridden = annotated.tokenizedText;
  assert.equal(overridden.text, "manual");

  annotated.documentId = "doc-override";
  assert.equal(annotated.documentId, "doc-override");
});

void test("AnnotatedDocument returns undefined tokenized text when text is missing", () => {
  const annotated = new AnnotatedDocument({ documentId: "doc-empty" });
  assert.equal(annotated.tokenizedText, undefined);
});

void test("ExampleData stores extraction list and generateDocumentId format is stable", () => {
  const extraction = new Extraction("location", "Berlin");
  const data = new ExampleData("Alice moved to Berlin.", [extraction]);

  assert.equal(data.text, "Alice moved to Berlin.");
  assert.equal(data.extractions.length, 1);
  assert.equal(data.extractions[0]?.extractionText, "Berlin");

  const generated = generateDocumentId();
  assert.match(generated, /^doc_[0-9a-f]{8}$/);
});
