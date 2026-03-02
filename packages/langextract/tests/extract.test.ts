import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { extract } from "../src/public/extract.js";

function createMockModel(responseText: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doGenerate: {
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: "text", text: responseText }],
      warnings: [],
      request: {},
      response: {
        id: "mock-response",
        modelId: "mock-model",
        timestamp: new Date(),
      },
    },
  });
}

function createExamples() {
  return [
    {
      text: "Alice works at OpenAI in Berlin.",
      extractions: [
        { extractionClass: "person", extractionText: "Alice" },
        { extractionClass: "organization", extractionText: "OpenAI" },
      ],
    },
  ] as const;
}

void test("extract(text) returns resolved extractions", async () => {
  const result = await extract({
    text: "Alice works at OpenAI in Berlin.",
    examples: createExamples(),
    model: createMockModel(
      JSON.stringify({
        extractions: [
          { text: "Alice", label: "person" },
          { text: "OpenAI", label: "organization" },
          { text: "Berlin", label: "location" },
        ],
      }),
    ),
    passes: 2,
  });

  assert.equal(result.extractions.length, 3);
  assert.equal(
    result.extractions.every((item) => item.alignmentStatus === "exact"),
    true,
  );
});

void test("extract(documents) processes batches", async () => {
  const result = await extract({
    documents: [
      { id: "doc-1", text: "Alice lives in Berlin." },
      { id: "doc-2", text: "Bob moved to Paris." },
    ],
    examples: createExamples(),
    model: createMockModel(
      JSON.stringify({
        extractions: [{ text: "Berlin", label: "location" }],
      }),
    ),
    batchSize: 1,
  });

  assert.equal(result.documents.length, 2);
  const firstDocument = result.documents[0];
  assert.ok(firstDocument !== undefined);
  assert.equal(firstDocument.extractions.length, 1);
  assert.equal(firstDocument.extractions[0]?.documentId, "doc-1");
});

void test("extract precedence: model overrides config and route settings", async () => {
  const explicitModel = createMockModel(
    JSON.stringify({
      extractions: [{ text: "Alice", label: "person" }],
    }),
  );

  const configModel = createMockModel(
    JSON.stringify({
      extractions: [{ text: "Berlin", label: "location" }],
    }),
  );

  const result = await extract({
    text: "Alice works at OpenAI in Berlin.",
    examples: createExamples(),
    model: explicitModel,
    config: {
      model: configModel,
      modelId: "openai:gpt-4.1-mini",
      provider: "openai",
    },
    modelId: "openai:gpt-4.1-mini",
    provider: "openai",
  });

  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.text, "Alice");
});

void test("extract(text) fetches URL content by default", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(typeof input === "string" ? input : input.toString());
    return new Response("Alice moved to Berlin.", {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });
  };

  try {
    const result = await extract({
      text: "https://example.test/article",
      examples: createExamples(),
      model: createMockModel(
        JSON.stringify({
          extractions: [{ text: "Alice", label: "person" }],
        }),
      ),
    });

    assert.equal(calls.length, 1);
    assert.equal(result.document.document.text, "Alice moved to Berlin.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test("extract(text) does not fetch URL when fetchUrls=false", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async (): Promise<Response> => {
    called = true;
    return new Response("ignored", { status: 200 });
  };

  try {
    const urlText = "https://example.test/article";
    const result = await extract({
      text: urlText,
      examples: createExamples(),
      fetchUrls: false,
      model: createMockModel(
        JSON.stringify({
          extractions: [{ text: "https://example.test/article", label: "url" }],
        }),
      ),
    });

    assert.equal(called, false);
    assert.equal(result.document.document.text, urlText);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test("extract prompt validation strict mode raises on non-exact examples", async () => {
  const examples = [
    {
      text: "Alice works at OpenAI in Berlin.",
      extractions: [{ extractionClass: "person", extractionText: "Alyce" }],
    },
  ] as const;

  await assert.rejects(
    extract({
      text: "Alice works at OpenAI in Berlin.",
      examples,
      promptValidationLevel: "error",
      promptValidationStrict: true,
      model: createMockModel(
        JSON.stringify({
          extractions: [{ text: "Alice", label: "person" }],
        }),
      ),
    }),
    /could not be aligned/,
  );
});

void test("extract emits alignment warnings through onWarning callback", async () => {
  const warnings: string[] = [];
  const examples = [
    {
      text: "Alice works at Open AI in Berlin.",
      extractions: [{ extractionClass: "organization", extractionText: "openai" }],
    },
  ] as const;

  await extract({
    text: "Alice works at Open AI in Berlin.",
    examples,
    promptValidationLevel: "warn",
    onWarning: (warning) => warnings.push(warning.code),
    model: createMockModel(
      JSON.stringify({
        extractions: [{ text: "Alice", label: "person" }],
      }),
    ),
  });

  assert.equal(warnings.includes("prompt_alignment_non_exact"), true);
});
