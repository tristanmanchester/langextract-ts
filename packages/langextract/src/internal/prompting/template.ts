const VARIABLE_PATTERN = /{{\s*([A-Za-z0-9_]+)\s*}}/g;

export interface PromptTemplateVariables {
  [key: string]: string;
}

export const DEFAULT_EXTRACTION_TEMPLATE = [
  "You are an information extraction assistant.",
  "Task:",
  "{{promptDescription}}",
  "",
  "Context:",
  "{{context}}",
  "",
  "Extraction schema:",
  "{{schema}}",
  "",
  "Questions:",
  "{{questions}}",
  "",
  "Input text:",
  "{{inputText}}",
  "",
  "{{outputInstructions}}",
].join("\n");

export class PromptTemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PromptTemplateError";
  }
}

export function renderPromptTemplate(template: string, variables: PromptTemplateVariables): string {
  const missingVariables = new Set<string>();

  const rendered = template.replace(VARIABLE_PATTERN, (fullMatch: string, key: string) => {
    const value = variables[key];
    if (typeof value !== "string") {
      missingVariables.add(key);
      return fullMatch;
    }

    return value;
  });

  if (missingVariables.size > 0) {
    const missing = Array.from(missingVariables).sort((a, b) => a.localeCompare(b));
    throw new PromptTemplateError(
      `Template is missing values for variables: ${missing.map((item) => `"${item}"`).join(", ")}`,
    );
  }

  return rendered;
}
