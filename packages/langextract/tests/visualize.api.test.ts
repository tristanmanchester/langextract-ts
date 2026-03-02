import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { saveAnnotatedDocuments } from "../src/public/io.js";
import { visualize } from "../src/public/visualization.js";

void test("visualize renders a single annotated document", async () => {
  const html = await visualize({
    document: { id: "doc-1", text: "Alice in Berlin" },
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
        raw: { text: "Alice", label: "person" },
      },
    ],
    promptValidationReports: [],
  });

  assert.match(html, /Alice/);
  assert.match(html, /Highlights Legend/);
});

void test("visualize selects a document by id when provided an array", async () => {
  const html = await visualize(
    [
      {
        document: { id: "doc-a", text: "No entities." },
        extractions: [],
        promptValidationReports: [],
      },
      {
        document: { id: "doc-b", text: "Alice in Berlin" },
        extractions: [
          {
            text: "Berlin",
            label: "location",
            start: 9,
            end: 15,
            alignmentStatus: "exact",
            alignmentScore: 1,
            documentId: "doc-b",
            pass: 0,
            raw: { text: "Berlin", label: "location" },
          },
        ],
        promptValidationReports: [],
      },
    ],
    { documentId: "doc-b", showLegend: false },
  );

  assert.match(html, /Berlin/);
  assert.doesNotMatch(html, /Highlights Legend/);
});

void test("visualize supports JSONL path input", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "langextract-visualize-"));
  const outputPath = path.join(tempDir, "docs.jsonl");

  await saveAnnotatedDocuments(outputPath, [
    {
      document: { id: "doc-path", text: "Alice in Berlin" },
      extractions: [
        {
          text: "Berlin",
          label: "location",
          start: 9,
          end: 15,
          alignmentStatus: "exact",
          alignmentScore: 1,
          documentId: "doc-path",
          pass: 0,
          raw: { text: "Berlin", label: "location" },
        },
      ],
      promptValidationReports: [],
    },
  ]);

  const html = await visualize(outputPath, { wrapInContainer: false, gifOptimized: false });
  assert.match(html, /Berlin/);
  assert.doesNotMatch(html, /<style>/);
});

void test("visualize rejects empty arrays and missing document ids", async () => {
  await assert.rejects(visualize([]), /No annotated documents found/);

  await assert.rejects(
    visualize(
      [
        {
          document: { id: "doc-1", text: "Alice" },
          extractions: [],
          promptValidationReports: [],
        },
      ],
      { documentId: "missing" },
    ),
    /Document ID not found/,
  );
});
