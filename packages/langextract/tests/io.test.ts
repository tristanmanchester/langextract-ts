import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  fetchTextFromUrl,
  isUrl,
  loadAnnotatedDocumentsJsonl,
  saveAnnotatedDocuments,
} from "../src/public/io.js";

void test("isUrl matches Python validation cases", () => {
  const validUrls = [
    "http://example.com",
    "https://www.example.com",
    "http://localhost:8080",
    "http://192.168.1.1",
    "http://[2001:db8::1]",
    "http://[::1]:8080",
  ];

  for (const value of validUrls) {
    assert.equal(isUrl(value), true, `Expected URL to be valid: ${value}`);
  }

  const invalidUrls = [
    "http://example.com is a website",
    "http://medical-journal.com published a study",
    "example.com",
    "www.example.com",
    "ftp://example.com",
  ];

  for (const value of invalidUrls) {
    assert.equal(isUrl(value), false, `Expected URL to be invalid: ${value}`);
  }
});

void test("save/load annotated documents JSONL roundtrip", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-"));
  const outputPath = path.join(tempDir, "annotations.jsonl");

  await saveAnnotatedDocuments(outputPath, [
    {
      document: {
        id: "doc-1",
        text: "Alice works at OpenAI in Berlin.",
      },
      extractions: [
        {
          text: "Alice",
          label: "person",
          start: 0,
          end: 5,
          alignmentStatus: "exact",
          alignmentScore: 1,
          documentId: "doc-1",
          pass: 0,
          raw: {
            text: "Alice",
            label: "person",
          },
        },
      ],
      promptValidationReports: [],
    },
  ]);

  const loaded = await loadAnnotatedDocumentsJsonl(outputPath);
  assert.equal(loaded.length, 1);
  const first = loaded[0];
  assert.ok(first !== undefined);
  assert.equal(first.document.id, "doc-1");
  assert.equal(first.extractions.length, 1);
  const extraction = first.extractions[0];
  assert.ok(extraction !== undefined);
  assert.equal(extraction.text, "Alice");
  assert.equal(extraction.alignmentStatus, "exact");
});

void test("saveAnnotatedDocuments throws when nothing can be written", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-empty-"));
  const outputPath = path.join(tempDir, "annotations.jsonl");

  await assert.rejects(saveAnnotatedDocuments(outputPath, []), /No annotated documents to save/);
});

void test("fetchTextFromUrl returns body and metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Hello world", {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });

  try {
    const result = await fetchTextFromUrl("https://example.test");
    assert.equal(result.status, 200);
    assert.equal(result.contentType, "text/plain");
    assert.equal(result.text, "Hello world");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
