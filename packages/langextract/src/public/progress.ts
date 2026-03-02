export interface ProgressBarDescriptor {
  description: string;
  total?: number;
  unit?: string;
  unitScale?: boolean;
  disable?: boolean;
}

export interface ExtractionProgressDescriptor<T> extends ProgressBarDescriptor {
  iterable: Iterable<T>;
}

const DEFAULT_MAX_URL_LENGTH = 50;

export function createDownloadProgressBar(
  totalSize: number,
  url: string,
  maxUrlLength = DEFAULT_MAX_URL_LENGTH,
): ProgressBarDescriptor {
  return {
    total: Math.max(0, Math.floor(totalSize)),
    unit: "B",
    unitScale: true,
    description: `LangExtract: Downloading ${truncateUrl(url, maxUrlLength)}`,
  };
}

export function createExtractionProgressBar<T>(
  iterable: Iterable<T>,
  modelInfo?: string,
  disable = false,
): ExtractionProgressDescriptor<T> {
  return {
    iterable,
    disable,
    description: formatExtractionProgress(modelInfo),
  };
}

export function createSaveProgressBar(outputPath: string, disable = false): ProgressBarDescriptor {
  return {
    disable,
    unit: "docs",
    description: `LangExtract: Saving to ${basename(outputPath)}`,
  };
}

export function createLoadProgressBar(
  filePath: string,
  totalSize?: number,
  disable = false,
): ProgressBarDescriptor {
  return {
    disable,
    ...(typeof totalSize === "number" ? { total: totalSize, unit: "B", unitScale: true } : {}),
    ...(typeof totalSize === "number"
      ? {}
      : {
          unit: "docs",
        }),
    description: `LangExtract: Loading ${basename(filePath)}`,
  };
}

export function getModelInfo(languageModel: unknown): string | undefined {
  if (!isRecord(languageModel)) {
    return undefined;
  }

  const modelId = languageModel.modelId;
  if (typeof modelId === "string" && modelId.length > 0) {
    return modelId;
  }

  const modelIdSnake = languageModel.model_id;
  if (typeof modelIdSnake === "string" && modelIdSnake.length > 0) {
    return modelIdSnake;
  }

  const modelUrl = languageModel.modelUrl;
  if (typeof modelUrl === "string" && modelUrl.length > 0) {
    return modelUrl;
  }

  const modelUrlSnake = languageModel.model_url;
  if (typeof modelUrlSnake === "string" && modelUrlSnake.length > 0) {
    return modelUrlSnake;
  }

  return undefined;
}

export function formatExtractionStats(currentChars: number, processedChars: number): string {
  return `current=${formatNumber(currentChars)} chars, processed=${formatNumber(processedChars)} chars`;
}

export function createExtractionPostfix(currentChars: number, processedChars: number): string {
  return formatExtractionStats(currentChars, processedChars);
}

export function formatExtractionProgress(
  modelInfo?: string,
  currentChars?: number,
  processedChars?: number,
): string {
  const base =
    typeof modelInfo === "string" && modelInfo.length > 0
      ? `LangExtract: model=${modelInfo}`
      : "LangExtract: Processing";

  if (typeof currentChars === "number" && typeof processedChars === "number") {
    return `${base}, ${formatExtractionStats(currentChars, processedChars)}`;
  }

  return base;
}

function truncateUrl(url: string, maxUrlLength: number): string {
  if (url.length <= maxUrlLength) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname || parsed.host || "unknown";
    const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
    const filename = segments[segments.length - 1] ?? "file";
    const compact = `${domain}/.../${filename}`;
    if (compact.length <= maxUrlLength) {
      return compact;
    }
  } catch {
    // Fall back to plain truncation for non-URL input.
  }

  return `${url.slice(0, Math.max(0, maxUrlLength - 3))}...`;
}

function basename(value: string): string {
  const parts = value.split(/[\\/]/g).filter((segment) => segment.length > 0);
  return parts[parts.length - 1] ?? value;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
