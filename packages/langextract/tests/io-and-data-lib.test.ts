import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  Dataset,
  fetchTextFromUrl,
  isUrl,
  loadAnnotatedDocumentsJsonl,
  loadCsvDataset,
  loadJsonl,
  saveAnnotatedDocuments,
  saveJsonl,
} from "../src/public/io.js";
import { AnnotatedDocument, Document, generateDocumentId } from "../src/internal/core/data.js";

void test("saveJsonl supports append mode and loadJsonl parses all rows", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-jsonl-"));
  const jsonlPath = path.join(tempDir, "records.jsonl");

  await saveJsonl(jsonlPath, [{ id: 1 }]);
  await saveJsonl(jsonlPath, [{ id: 2 }], { append: true });

  const rows = await loadJsonl<{ id: number }>(jsonlPath);
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
});

void test("fetchTextFromUrl throws on non-2xx responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("not found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });

  try {
    await assert.rejects(fetchTextFromUrl("https://example.test/missing"), /HTTP 404/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test("isUrl accepts IPv6 and rejects invalid IPv4 host parts", () => {
  assert.equal(isUrl("https://[2001:db8::1]"), true);
  assert.equal(isUrl("http://999.10.10.10"), false);
});

void test("loadCsvDataset parses quoted delimiters and escaped quotes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-csv-"));
  const csvPath = path.join(tempDir, "dataset.csv");

  await writeFile(csvPath, ["id,text", '1,"hello, world"', '2,"say ""hi"""'].join("\n"), "utf8");

  const rows = await loadCsvDataset(csvPath, {
    idKey: "id",
    textKey: "text",
  });

  assert.deepEqual(rows, [
    { id: "1", text: "hello, world" },
    { id: "2", text: 'say "hi"' },
  ]);
});

void test("loadCsvDataset throws for empty files and missing required columns", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-csv-errors-"));
  const emptyPath = path.join(tempDir, "empty.csv");
  const missingColumnsPath = path.join(tempDir, "missing-cols.csv");

  await writeFile(emptyPath, "", "utf8");
  await writeFile(missingColumnsPath, ["id,body", "1,Hello"].join("\n"), "utf8");

  await assert.rejects(
    loadCsvDataset(emptyPath, { idKey: "id", textKey: "text" }),
    /Empty dataset/i,
  );
  await assert.rejects(
    loadCsvDataset(missingColumnsPath, { idKey: "id", textKey: "text" }),
    /CSV missing required columns/i,
  );
});

void test("loadCsvDataset skips rows missing required values", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-csv-short-rows-"));
  const csvPath = path.join(tempDir, "dataset.csv");

  await writeFile(csvPath, ["id,text", "1,Hello", "2", "3,World"].join("\n"), "utf8");

  const rows = await loadCsvDataset(csvPath, {
    idKey: "id",
    textKey: "text",
  });

  assert.deepEqual(rows, [
    { id: "1", text: "Hello" },
    { id: "3", text: "World" },
  ]);
});

void test("saveAnnotatedDocuments filters empty ids and sanitizes raw attributes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-annotated-"));
  const outputPath = path.join(tempDir, "annotations.jsonl");

  await saveAnnotatedDocuments(outputPath, [
    {
      document: { id: "", text: "skip" },
      extractions: [],
      promptValidationReports: [],
    },
    {
      document: { id: "doc-1", text: "Alice" },
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
            start: 0,
            end: 5,
            confidence: 0.9,
            source: "manual",
            tags: ["demo"],
          },
        },
      ],
      promptValidationReports: [],
    },
  ]);

  const fileRows = await loadJsonl<{
    document_id: string;
    extractions?: Array<{ attributes?: Record<string, unknown> }>;
  }>(outputPath);
  assert.equal(fileRows.length, 1);
  const firstRow = fileRows[0];
  assert.ok(firstRow !== undefined);
  assert.equal(firstRow.document_id, "doc-1");
  assert.deepEqual(firstRow.extractions?.[0]?.attributes, {
    source: "manual",
    tags: ["demo"],
  });
});

void test("saveAnnotatedDocuments throws when every record is filtered out", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-empty-filtered-"));
  const outputPath = path.join(tempDir, "annotations.jsonl");

  await assert.rejects(
    saveAnnotatedDocuments(outputPath, [
      {
        document: { id: "", text: "ignored" },
        extractions: [],
        promptValidationReports: [],
      },
    ]),
    /No annotated documents to save/i,
  );
});

void test("loadAnnotatedDocumentsJsonl normalizes legacy alignment statuses", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-normalize-"));
  const outputPath = path.join(tempDir, "annotations.jsonl");

  await writeFile(
    outputPath,
    [
      JSON.stringify({
        document_id: "doc-1",
        text: "Alice Berlin",
        extractions: [
          {
            text: "Alice",
            label: "person",
            start: 0,
            end: 5,
            alignment_status: "match_exact",
            alignment_score: 1,
          },
          {
            text: "Berlin",
            label: "location",
            start: 6,
            end: 12,
            alignment_status: "match_greater",
            alignment_score: 0.8,
          },
          {
            text: "Unknown",
            label: "misc",
            start: -1,
            end: -1,
            alignment_status: "unexpected",
            alignment_score: 0,
          },
          {
            text: "AliasFuzzy",
            label: "misc",
            start: 0,
            end: 1,
            alignment_status: "match_fuzzy",
            alignment_score: 0.7,
          },
        ],
      }),
      "",
    ].join("\n"),
    "utf8",
  );

  const loaded = await loadAnnotatedDocumentsJsonl(outputPath);
  const firstLoaded = loaded[0];
  assert.ok(firstLoaded !== undefined);
  assert.equal(firstLoaded.extractions[0]?.alignmentStatus, "exact");
  assert.equal(firstLoaded.extractions[1]?.alignmentStatus, "lesser");
  assert.equal(firstLoaded.extractions[2]?.alignmentStatus, "fuzzy");
  assert.equal(firstLoaded.extractions[3]?.alignmentStatus, "fuzzy");
});

void test("core data models lazily generate ids and tokenize text", () => {
  const generated = generateDocumentId();
  assert.match(generated, /^doc_[0-9a-f]{8}$/);

  const document = new Document("Alice in Berlin");
  const firstId = document.documentId;
  const secondId = document.documentId;
  assert.equal(firstId, secondId);

  const firstTokens = document.tokenizedText;
  const secondTokens = document.tokenizedText;
  assert.equal(firstTokens, secondTokens);

  const annotated = new AnnotatedDocument({ text: "Hello" });
  assert.ok(annotated.tokenizedText !== undefined);
  assert.equal(annotated.tokenizedText, annotated.tokenizedText);

  const emptyAnnotated = new AnnotatedDocument();
  assert.equal(emptyAnnotated.tokenizedText, undefined);
});

void test("loadJsonl ignores blank lines", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-io-loadjsonl-"));
  const filePath = path.join(tempDir, "records.jsonl");

  await writeFile(filePath, '{"id":1}\n\n  \n{"id":2}\n', "utf8");

  const rows = await loadJsonl<{ id: number }>(filePath);
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);

  const raw = await readFile(filePath, "utf8");
  assert.match(raw, /\n\n/);
});

void test("Dataset.load auto-detects csv from extension and supports custom delimiters", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-dataset-csv-"));
  const csvPath = path.join(tempDir, "dataset.csv");

  await writeFile(csvPath, ["id;text", "a;Alpha", "b;Beta"].join("\n"), "utf8");

  const rows = await Dataset.load(csvPath, {
    delimiter: ";",
    idKey: "id",
    textKey: "text",
  });

  assert.deepEqual(rows, [
    { id: "a", text: "Alpha" },
    { id: "b", text: "Beta" },
  ]);
});

void test("Dataset.load honors explicit jsonl format even with csv extension", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-dataset-jsonl-"));
  const csvNamedJsonlPath = path.join(tempDir, "dataset.csv");

  await writeFile(
    csvNamedJsonlPath,
    [
      JSON.stringify({ doc_id: "doc-1", body: "Alice" }),
      JSON.stringify({ doc_id: 2, body: "invalid-id-type" }),
      JSON.stringify({ doc_id: "doc-3", body: "Berlin" }),
    ].join("\n"),
    "utf8",
  );

  const rows = await Dataset.load(csvNamedJsonlPath, {
    format: "jsonl",
    idKey: "doc_id",
    textKey: "body",
  });

  assert.deepEqual(rows, [
    { id: "doc-1", text: "Alice" },
    { id: "doc-3", text: "Berlin" },
  ]);
});

void test("Dataset.load defaults to jsonl for non-csv extensions", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-dataset-txt-"));
  const jsonlPath = path.join(tempDir, "dataset.txt");

  await writeFile(
    jsonlPath,
    [
      JSON.stringify({ id: "doc-1", text: "Hello world" }),
      JSON.stringify({ id: "doc-2", text: "Hi" }),
    ].join("\n"),
    "utf8",
  );

  const rows = await Dataset.load(jsonlPath);
  assert.deepEqual(rows, [
    { id: "doc-1", text: "Hello world" },
    { id: "doc-2", text: "Hi" },
  ]);
});
