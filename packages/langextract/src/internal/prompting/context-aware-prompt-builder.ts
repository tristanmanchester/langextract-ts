import { buildQAPrompt } from "./qa-prompt.js";
import { DEFAULT_EXTRACTION_TEMPLATE, renderPromptTemplate } from "./template.js";

export interface PromptSchemaField {
  label: string;
  description?: string;
}

export interface ContextAwarePromptOptions {
  text: string;
  context?: string;
  promptDescription?: string;
  questions?: readonly string[];
  schema?: readonly PromptSchemaField[];
  promptTemplate?: string;
  outputFormat?: "json" | "yaml" | "none";
}

export function buildContextAwarePrompt(options: ContextAwarePromptOptions): string {
  const outputFormat = options.outputFormat ?? "json";
  const normalizedText = options.text.trim();
  const normalizedContext = options.context?.trim() ?? "No additional context provided.";
  const normalizedDescription =
    options.promptDescription?.trim() ?? "Extract high-value structured information.";

  const questions =
    options.questions !== undefined && options.questions.length > 0
      ? options.questions.map((question, index) => `${index + 1}. ${question.trim()}`).join("\n")
      : "No explicit questions provided. Extract any high-value entities.";

  const schema =
    options.schema !== undefined && options.schema.length > 0
      ? options.schema
          .map((field, index) => {
            const description = field.description?.trim();
            if (description === undefined || description.length === 0) {
              return `${index + 1}. ${field.label}`;
            }

            return `${index + 1}. ${field.label}: ${description}`;
          })
          .join("\n")
      : "No fixed schema provided. Infer useful labels from the text.";

  if (options.questions !== undefined && options.questions.length === 1) {
    const question = options.questions[0]?.trim();
    if (question !== undefined && question.length > 0) {
      if (outputFormat === "none") {
        return [
          "Answer the question using only the provided context.",
          "If the answer is unknown, return an empty answer.",
          "Question:",
          question,
          "",
          "Context:",
          `${normalizedContext}\n\n${normalizedText}`,
          "",
          "Return a concise plain-text answer.",
        ].join("\n");
      }

      return buildQAPrompt({
        question,
        context: `${normalizedContext}\n\n${normalizedText}`,
        outputFormat,
      });
    }
  }

  return renderPromptTemplate(options.promptTemplate ?? DEFAULT_EXTRACTION_TEMPLATE, {
    promptDescription: normalizedDescription,
    context: normalizedContext,
    inputText: normalizedText,
    questions,
    schema,
    outputInstructions: buildOutputInstructions(outputFormat),
  });
}

function buildOutputInstructions(outputFormat: "json" | "yaml" | "none"): string {
  if (outputFormat === "yaml") {
    return [
      "Return YAML only in this shape:",
      "extractions:",
      '  - text: ""',
      '    label: ""',
      "    confidence: 0.0",
    ].join("\n");
  }

  if (outputFormat === "none") {
    return "Return concise extraction candidates without enforcing JSON or YAML formatting.";
  }

  return [
    "Return JSON only in this shape:",
    '{"extractions":[{"text":"","label":"","confidence":0.0}]}',
  ].join("\n");
}
