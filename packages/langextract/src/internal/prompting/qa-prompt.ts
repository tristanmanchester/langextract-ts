export interface QAPromptOptions {
  question: string;
  context: string;
  outputFormat?: "json" | "yaml";
}

export function buildQAPrompt(options: QAPromptOptions): string {
  const format = options.outputFormat ?? "json";
  const shape =
    format === "yaml"
      ? [
          "answer: <short answer>",
          "confidence: <0..1>",
          "evidence: <quoted phrase from context>",
        ].join("\n")
      : '{"answer":"","confidence":0.0,"evidence":""}';

  return [
    "Answer the question using only the provided context.",
    "If the answer is unknown, use an empty answer and confidence 0.",
    "Question:",
    options.question.trim(),
    "",
    "Context:",
    options.context.trim(),
    "",
    `Return ${format.toUpperCase()} in this shape:`,
    shape,
  ].join("\n");
}
