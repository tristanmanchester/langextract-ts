import assert from "node:assert/strict";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { AnnotatorPipeline } from "../src/internal/annotation/index.js";
import { InferenceRuntimeError, InvalidDocumentError } from "../src/internal/core/errors.js";
import { PromptValidationError } from "../src/internal/prompting/index.js";
import type { LangextractModel, ModelCandidate } from "../src/internal/providers/index.js";

function generateResult(text: string) {
  return {
    finishReason: "stop" as const,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    content: [{ type: "text" as const, text }],
    warnings: [],
    request: {},
    response: {
      id: "mock-response",
      modelId: "mock-model",
      timestamp: new Date(0),
    },
  };
}

function createModelCandidate(
  provider: string,
  modelId: string,
  doGenerate: ConstructorParameters<typeof MockLanguageModelV3>[0]["doGenerate"],
): ModelCandidate {
  return {
    provider,
    modelId,
    model: new MockLanguageModelV3({
      provider,
      modelId,
      doGenerate,
    }),
  };
}

function createLangextractModel(
  primary: ModelCandidate,
  fallbackModels: readonly ModelCandidate[] = [],
): LangextractModel {
  return {
    provider: primary.provider,
    modelId: primary.modelId,
    model: primary.model,
    fallbackModels,
  };
}

void test("annotator rejects duplicate document ids", async () => {
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
  });

  await assert.rejects(
    pipeline.annotateDocuments([
      { id: "dup", text: "One" },
      { id: "dup", text: "Two" },
    ]),
    InvalidDocumentError,
  );
});

void test("annotator falls back on retriable status errors", async () => {
  const primary = createModelCandidate("mock", "primary", async () => {
    const error = new Error("model not found") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  });

  const fallback = createModelCandidate(
    "mock",
    "fallback",
    generateResult('{"extractions":[{"text":"Alice","label":"person"}]}'),
  );

  const events: Array<Record<string, unknown>> = [];
  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary, [fallback]),
    onModelCall(event) {
      events.push(event as Record<string, unknown>);
    },
  });

  const result = await pipeline.annotateText({ id: "doc-1", text: "Alice" });

  assert.equal(result.extractions.length, 1);
  const firstExtraction = result.extractions[0];
  assert.ok(firstExtraction !== undefined);
  assert.equal(firstExtraction.label, "person");
  assert.equal(events.length, 2);
  const firstEvent = events[0];
  const secondEvent = events[1];
  assert.ok(firstEvent !== undefined);
  assert.ok(secondEvent !== undefined);
  assert.equal(firstEvent.success, false);
  assert.equal(firstEvent.fallbackUsed, false);
  assert.equal(secondEvent.success, true);
  assert.equal(secondEvent.fallbackUsed, true);
  assert.equal(secondEvent.documentId, "doc-1");
});

void test("annotator retries on temporary message without status code", async () => {
  let primaryCalls = 0;
  const primary = createModelCandidate("mock", "primary", async () => {
    primaryCalls += 1;
    throw new Error("Temporarily unavailable");
  });

  const fallback = createModelCandidate(
    "mock",
    "fallback",
    generateResult('{"extractions":[{"text":"Berlin","label":"location"}]}'),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary, [fallback]),
  });

  const result = await pipeline.annotateText({ id: "doc-2", text: "Berlin" });
  assert.equal(primaryCalls, 1);
  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.label, "location");
});

void test("annotator stops on non-retriable errors and redacts secrets", async () => {
  const primary = createModelCandidate("mock", "primary", async () => {
    const error = new Error("api_key=secret123") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  });

  const fallback = createModelCandidate(
    "mock",
    "fallback",
    generateResult('{"extractions":[{"text":"ignored","label":"x"}]}'),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary, [fallback]),
  });

  await assert.rejects(pipeline.annotateText({ id: "doc-3", text: "Alice" }), (error: unknown) => {
    assert.ok(error instanceof InferenceRuntimeError);
    assert.match(error.message, /\[REDACTED\]/);
    assert.doesNotMatch(error.message, /secret123/);
    return true;
  });
});

void test("annotator includes document context and previous chunk context in prompts", async () => {
  const prompts: string[] = [];
  const primary = createModelCandidate("mock", "primary", async (options) => {
    const promptText =
      typeof options.prompt === "string"
        ? options.prompt
        : options.prompt
            .flatMap((message) => message.content)
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    prompts.push(promptText);
    return generateResult('{"extractions":[]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 12,
    contextWindowChars: 8,
    promptValidationLevel: "off",
  });

  await pipeline.annotateDocuments([
    {
      id: "doc-ctx",
      text: "First sentence. Second sentence.",
      metadata: { additionalContext: "Document context" },
    },
  ]);

  assert.equal(prompts.length >= 2, true);
  const firstPrompt = prompts[0] ?? "";
  const secondPrompt = prompts[1] ?? "";
  assert.match(firstPrompt, /Document context/);
  assert.match(secondPrompt, /Previous chunk context:/);
});

void test("annotator does not include previous chunk context when contextWindowChars is disabled", async () => {
  const prompts: string[] = [];
  const primary = createModelCandidate("mock", "primary", async (options) => {
    const promptText =
      typeof options.prompt === "string"
        ? options.prompt
        : options.prompt
            .flatMap((message) => message.content)
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    prompts.push(promptText);
    return generateResult('{"extractions":[]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 12,
    batchSize: 1,
    maxWorkers: 1,
    promptValidationLevel: "off",
  });

  await pipeline.annotateText({
    id: "doc-no-context-window",
    text: "First chunk. Second chunk.",
  });

  assert.equal(prompts.length >= 2, true);
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /Previous chunk context:/);
  }
});

void test("annotator keeps context windows isolated per document", async () => {
  const prompts: string[] = [];
  const primary = createModelCandidate("mock", "primary", async (options) => {
    const promptText =
      typeof options.prompt === "string"
        ? options.prompt
        : options.prompt
            .flatMap((message) => message.content)
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    prompts.push(promptText);
    return generateResult('{"extractions":[]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 12,
    batchSize: 1,
    maxWorkers: 1,
    contextWindowChars: 20,
    promptValidationLevel: "off",
  });

  await pipeline.annotateDocuments([
    { id: "doc-1", text: "Doc1 one. Doc1 two." },
    { id: "doc-2", text: "Doc2 one. Doc2 two." },
  ]);

  assert.equal(prompts.length, 4);
  const [doc1Chunk1, doc1Chunk2, doc2Chunk1, doc2Chunk2] = prompts;
  assert.ok(doc1Chunk1 !== undefined);
  assert.ok(doc1Chunk2 !== undefined);
  assert.ok(doc2Chunk1 !== undefined);
  assert.ok(doc2Chunk2 !== undefined);

  assert.doesNotMatch(doc1Chunk1, /Previous chunk context:/);
  assert.match(doc1Chunk2, /Previous chunk context:/);
  assert.match(doc1Chunk2, /Doc1 one\./);

  assert.doesNotMatch(doc2Chunk1, /Previous chunk context:/);
  assert.doesNotMatch(doc2Chunk1, /Doc1/);
  assert.match(doc2Chunk2, /Previous chunk context:/);
  assert.match(doc2Chunk2, /Doc2 one\./);
  assert.doesNotMatch(doc2Chunk2, /Doc1/);
});

void test("annotator skips JSON-instruction prompt validation requirement when formatType is none", async () => {
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    formatType: "none",
    promptValidationLevel: "error",
    promptBuilder() {
      return "Extract relevant entities from the input text.";
    },
  });

  const result = await pipeline.annotateText({
    id: "doc-format-none",
    text: "Alice works in Berlin.",
  });

  assert.equal(result.extractions.length, 0);
});

void test("annotator defaults prompt linting to off for parity", async () => {
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "error",
    promptBuilder() {
      return "Extract entities from the text.";
    },
  });

  const result = await pipeline.annotateText({
    id: "doc-prompt-lint-off",
    text: "Alice works in Berlin.",
  });

  assert.equal(result.extractions.length, 0);
});

void test("annotator can enforce prompt linting when promptLintLevel is configured", async () => {
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptLintLevel: "error",
    promptBuilder() {
      return "Extract entities from the text.";
    },
  });

  await assert.rejects(
    pipeline.annotateText({
      id: "doc-prompt-lint-error",
      text: "Alice works in Berlin.",
    }),
    PromptValidationError,
  );
});

void test("annotator aligns extraction offsets to full-document coordinates across chunks", async () => {
  const sourceText = "Alice in Paris. Bob in Berlin.";
  const primary = createModelCandidate("mock", "primary", async (options) => {
    const promptText =
      typeof options.prompt === "string"
        ? options.prompt
        : options.prompt
            .flatMap((message) => message.content)
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");

    if (promptText.includes("Alice in Paris.")) {
      return generateResult('{"extractions":[{"text":"Paris","label":"location"}]}');
    }

    if (promptText.includes("Bob in Berlin.")) {
      return generateResult('{"extractions":[{"text":"Berlin","label":"location"}]}');
    }

    return generateResult('{"extractions":[]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 16,
    batchSize: 1,
    maxWorkers: 1,
    promptValidationLevel: "off",
  });

  const result = await pipeline.annotateText({
    id: "doc-offsets",
    text: sourceText,
  });

  const paris = result.extractions.find((item) => item.text === "Paris");
  const berlin = result.extractions.find((item) => item.text === "Berlin");

  assert.ok(paris !== undefined);
  assert.ok(berlin !== undefined);
  assert.equal(paris.start, sourceText.indexOf("Paris"));
  assert.equal(paris.end, sourceText.indexOf("Paris") + "Paris".length);
  assert.equal(berlin.start, sourceText.indexOf("Berlin"));
  assert.equal(berlin.end, sourceText.indexOf("Berlin") + "Berlin".length);
});

void test("annotator emits progress updates when showProgress is enabled", async () => {
  const progressUpdates: Array<Record<string, unknown>> = [];
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 12,
    batchSize: 1,
    maxWorkers: 1,
    passes: 2,
    promptValidationLevel: "off",
    showProgress: true,
    onProgress(event) {
      progressUpdates.push(event as Record<string, unknown>);
    },
  });

  await pipeline.annotateText({
    id: "doc-progress-enabled",
    text: "First chunk. Second chunk.",
  });

  assert.equal(progressUpdates.length > 0, true);
  const first = progressUpdates[0];
  const last = progressUpdates[progressUpdates.length - 1];
  assert.ok(first !== undefined);
  assert.ok(last !== undefined);
  assert.equal(first.completedChunks, 1);
  assert.equal(last.completedChunks, last.totalChunks);
  assert.equal(last.processedChars, last.totalChars);
});

void test("annotator suppresses progress updates when showProgress is disabled", async () => {
  const progressUpdates: Array<Record<string, unknown>> = [];
  const primary = createModelCandidate("mock", "primary", generateResult('{"extractions":[]}'));

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    maxCharBuffer: 12,
    batchSize: 1,
    maxWorkers: 1,
    promptValidationLevel: "off",
    showProgress: false,
    onProgress(event) {
      progressUpdates.push(event as Record<string, unknown>);
    },
  });

  await pipeline.annotateText({
    id: "doc-progress-disabled",
    text: "First chunk. Second chunk.",
  });

  assert.equal(progressUpdates.length, 0);
});

void test("annotator includes debug metadata in model-call events when debug is enabled", async () => {
  const events: Array<Record<string, unknown>> = [];
  const primary = createModelCandidate(
    "mock",
    "primary",
    generateResult('{"extractions":[{"text":"Alice","label":"person"}]}'),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "off",
    debug: true,
    onModelCall(event) {
      events.push(event as Record<string, unknown>);
    },
  });

  await pipeline.annotateText({ id: "doc-debug", text: "Alice" });

  assert.equal(events.length, 1);
  const first = events[0];
  assert.ok(first !== undefined);
  assert.equal(first.success, true);
  assert.equal(typeof first.promptChars, "number");
  assert.equal(typeof first.outputChars, "number");
  assert.equal(typeof first.promptPreview, "string");
  assert.equal(typeof first.outputPreview, "string");
});

void test("annotator omits debug metadata in model-call events when debug is disabled", async () => {
  const events: Array<Record<string, unknown>> = [];
  const primary = createModelCandidate(
    "mock",
    "primary",
    generateResult('{"extractions":[{"text":"Alice","label":"person"}]}'),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "off",
    debug: false,
    onModelCall(event) {
      events.push(event as Record<string, unknown>);
    },
  });

  await pipeline.annotateText({ id: "doc-no-debug", text: "Alice" });

  assert.equal(events.length, 1);
  const first = events[0];
  assert.ok(first !== undefined);
  assert.equal(first.promptChars, undefined);
  assert.equal(first.outputChars, undefined);
  assert.equal(first.promptPreview, undefined);
  assert.equal(first.outputPreview, undefined);
});

void test("annotator keeps first-pass extraction when later pass overlaps", async () => {
  let calls = 0;
  const primary = createModelCandidate("mock", "primary", async () => {
    calls += 1;
    if (calls === 1) {
      return generateResult('{"extractions":[{"text":"Alice","label":"person"}]}');
    }

    return generateResult('{"extractions":[{"text":"Alice","label":"name"}]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    passes: 2,
    promptValidationLevel: "off",
  });

  const result = await pipeline.annotateText({ id: "doc-pass", text: "Alice" });

  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.label, "person");
  assert.equal(calls, 2);
});

void test("annotator forwards model settings into generateText requests", async () => {
  let capturedRequest: Record<string, unknown> | undefined;
  const primary = createModelCandidate("mock", "primary", async (request) => {
    capturedRequest = request as Record<string, unknown>;
    return generateResult('{"extractions":[{"text":"Alice","label":"person"}]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "off",
    settings: {
      temperature: 0.2,
      topP: 0.9,
      topK: 20,
      maxOutputTokens: 300,
      frequencyPenalty: 0.1,
      presencePenalty: 0.15,
      stopSequences: ["\nEND"],
      seed: 42,
      timeout: 30_000,
      maxRetries: 2,
      headers: { "x-test": "1" },
      providerOptions: {
        mock: {
          custom: true,
        },
      },
    },
  });

  const result = await pipeline.annotateText({ id: "doc-settings", text: "Alice" });
  assert.equal(result.extractions.length, 1);
  assert.ok(capturedRequest !== undefined);
  assert.equal(capturedRequest.temperature, 0.2);
  assert.equal(capturedRequest.topP, 0.9);
  assert.equal(capturedRequest.topK, 20);
  assert.equal(capturedRequest.maxOutputTokens, 300);
  assert.equal(capturedRequest.frequencyPenalty, 0.1);
  assert.equal(capturedRequest.presencePenalty, 0.15);
  assert.deepEqual(capturedRequest.stopSequences, ["\nEND"]);
  assert.equal(capturedRequest.seed, 42);
  assert.equal((capturedRequest.headers as Record<string, string> | undefined)?.["x-test"], "1");
  assert.deepEqual(capturedRequest.providerOptions, {
    mock: {
      custom: true,
    },
  });
});

void test("annotator prefers exact alignment when duplicate keys have different alignment quality", async () => {
  const primary = createModelCandidate(
    "mock",
    "primary",
    generateResult(
      JSON.stringify({
        extractions: [
          { text: "alice", label: "person", start: 0, end: 5 },
          { text: "Alice", label: "person", start: 0, end: 5 },
        ],
      }),
    ),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "off",
  });

  const result = await pipeline.annotateText({ id: "doc-alignment-rank", text: "Alice" });
  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.alignmentStatus, "exact");
});

void test("annotator prefers higher confidence for duplicate extraction keys", async () => {
  const primary = createModelCandidate(
    "mock",
    "primary",
    generateResult(
      JSON.stringify({
        extractions: [
          { text: "Alice", label: "person", start: 0, end: 5, confidence: 0.15 },
          { text: "Alice", label: "person", start: 0, end: 5, confidence: 0.9 },
        ],
      }),
    ),
  );

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    promptValidationLevel: "off",
  });

  const result = await pipeline.annotateText({ id: "doc-confidence", text: "Alice" });
  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0]?.confidence, 0.9);
});

void test("annotator does not let invalid previous-pass intervals block later valid overlap", async () => {
  let calls = 0;
  const primary = createModelCandidate("mock", "primary", async () => {
    calls += 1;
    if (calls === 1) {
      return generateResult('{"extractions":[{"text":"Ghost","label":"entity"}]}');
    }

    return generateResult('{"extractions":[{"text":"Alice","label":"person"}]}');
  });

  const pipeline = new AnnotatorPipeline({
    model: createLangextractModel(primary),
    passes: 2,
    promptValidationLevel: "off",
  });

  const result = await pipeline.annotateText({ id: "doc-invalid-overlap", text: "Alice" });
  assert.equal(result.extractions.length, 2);
  assert.equal(
    result.extractions.some((entry) => entry.text === "Ghost" && entry.start < 0),
    true,
  );
  assert.equal(
    result.extractions.some((entry) => entry.text === "Alice" && entry.start === 0),
    true,
  );
});
