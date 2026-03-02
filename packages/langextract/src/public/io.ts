import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnnotatedDocument } from "../internal/annotation/index.js";

export interface SaveJsonlOptions {
  append?: boolean;
}

export interface FetchTextResult {
  url: string;
  status: number;
  contentType: string | null;
  text: string;
}

export type SaveAnnotatedDocumentsOptions = SaveJsonlOptions;

export interface AnnotatedDocumentJsonlRecord {
  document_id: string;
  text: string;
  extractions?: Array<{
    text: string;
    label: string;
    start: number;
    end: number;
    confidence?: number;
    alignment_status?: string;
    alignment_score?: number;
    pass?: number;
    attributes?: Record<string, unknown>;
  }>;
}

export interface LoadCsvDatasetOptions {
  idKey: string;
  textKey: string;
  delimiter?: string;
}

export interface DatasetDocument {
  id: string;
  text: string;
}

export interface DatasetLoadOptions {
  format?: "csv" | "jsonl";
  idKey?: string;
  textKey?: string;
  delimiter?: string;
}

export async function saveJsonl<T>(
  filePath: string,
  records: readonly T[],
  options: SaveJsonlOptions = {},
): Promise<void> {
  const lines = records.map((record) => JSON.stringify(record));
  const payload = lines.join("\n") + (lines.length > 0 ? "\n" : "");

  if (options.append ?? false) {
    await appendFile(filePath, payload, "utf8");
    return;
  }

  await writeFile(filePath, payload, "utf8");
}

export async function loadJsonl<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, "utf8");
  const rows = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return rows.map((row) => JSON.parse(row) as T);
}

export async function fetchTextFromUrl(url: string, init?: RequestInit): Promise<FetchTextResult> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL ${url}. HTTP ${response.status}`);
  }

  return {
    url: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    text: await response.text(),
  };
}

export function isUrl(text: string): boolean {
  if (typeof text !== "string" || text.trim().length === 0) {
    return false;
  }

  const candidate = text.trim();
  if (/\s/.test(candidate)) {
    return false;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (url.hostname.length === 0) {
      return false;
    }

    if (url.hostname === "localhost") {
      return true;
    }

    if (isIpAddress(url.hostname)) {
      return true;
    }

    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

export async function saveAnnotatedDocuments(
  filePath: string,
  annotatedDocuments: readonly AnnotatedDocument[],
  options: SaveAnnotatedDocumentsOptions = {},
): Promise<void> {
  if (annotatedDocuments.length === 0) {
    throw new Error("No annotated documents to save.");
  }

  const records: AnnotatedDocumentJsonlRecord[] = annotatedDocuments
    .filter((document) => document.document.id.length > 0)
    .map((document) => ({
      document_id: document.document.id,
      text: document.document.text,
      extractions: document.extractions.map((extraction) => ({
        text: extraction.text,
        label: extraction.label,
        start: extraction.start,
        end: extraction.end,
        ...(extraction.confidence !== undefined ? { confidence: extraction.confidence } : {}),
        alignment_status: extraction.alignmentStatus,
        alignment_score: extraction.alignmentScore,
        pass: extraction.pass,
        ...(isRecord(extraction.raw) ? { attributes: sanitizeRawAttributes(extraction.raw) } : {}),
      })),
    }));

  if (records.length === 0) {
    throw new Error("No annotated documents to save.");
  }

  await saveJsonl(filePath, records, options);
}

export async function loadAnnotatedDocumentsJsonl(filePath: string): Promise<AnnotatedDocument[]> {
  const rows = await loadJsonl<AnnotatedDocumentJsonlRecord>(filePath);
  return rows.map((row) => ({
    document: {
      id: row.document_id,
      text: row.text,
    },
    extractions: (row.extractions ?? []).map((extraction) => ({
      text: extraction.text,
      label: extraction.label,
      start: extraction.start,
      end: extraction.end,
      alignmentStatus: normalizeAlignmentStatus(extraction.alignment_status),
      alignmentScore: extraction.alignment_score ?? 0,
      documentId: row.document_id,
      pass: extraction.pass ?? 0,
      raw: {
        text: extraction.text,
        label: extraction.label,
        ...(extraction.attributes !== undefined ? extraction.attributes : {}),
      },
      ...(extraction.confidence !== undefined ? { confidence: extraction.confidence } : {}),
    })),
    promptValidationReports: [],
  }));
}

export async function loadCsvDataset(
  filePath: string,
  options: LoadCsvDatasetOptions,
): Promise<DatasetDocument[]> {
  const delimiter = options.delimiter ?? ",";
  const content = await readFile(filePath, "utf8");
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (rows.length === 0) {
    throw new Error(`Empty dataset: ${filePath}`);
  }

  const headers = parseCsvLine(rows[0] ?? "", delimiter);
  const idIndex = headers.indexOf(options.idKey);
  const textIndex = headers.indexOf(options.textKey);
  if (idIndex < 0 || textIndex < 0) {
    throw new Error(
      `CSV missing required columns. idKey=${options.idKey}, textKey=${options.textKey}`,
    );
  }

  const records: DatasetDocument[] = [];
  for (const row of rows.slice(1)) {
    const values = parseCsvLine(row, delimiter);
    const id = values[idIndex];
    const text = values[textIndex];
    if (id === undefined || text === undefined) {
      continue;
    }
    records.push({ id, text });
  }

  return records;
}

export class Dataset {
  public static async load(
    filePath: string,
    options: DatasetLoadOptions = {},
  ): Promise<DatasetDocument[]> {
    const detectedFormat = detectDatasetFormat(filePath, options.format);
    const idKey = options.idKey ?? "id";
    const textKey = options.textKey ?? "text";

    if (detectedFormat === "csv") {
      return loadCsvDataset(filePath, {
        idKey,
        textKey,
        ...(options.delimiter !== undefined ? { delimiter: options.delimiter } : {}),
      });
    }

    const rows = await loadJsonl<Record<string, unknown>>(filePath);
    return rows
      .map((row) => {
        const idValue = row[idKey];
        const textValue = row[textKey];
        if (typeof idValue !== "string" || typeof textValue !== "string") {
          return null;
        }

        return {
          id: idValue,
          text: textValue,
        };
      })
      .filter((item): item is DatasetDocument => item !== null);
  }
}

function normalizeAlignmentStatus(value: string | undefined): "exact" | "lesser" | "fuzzy" {
  if (value === "exact" || value === "lesser" || value === "fuzzy") {
    return value;
  }

  if (value === "match_exact") {
    return "exact";
  }
  if (value === "match_lesser" || value === "match_greater") {
    return "lesser";
  }
  if (value === "match_fuzzy") {
    return "fuzzy";
  }

  return "fuzzy";
}

function sanitizeRawAttributes(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (
      key === "text" ||
      key === "label" ||
      key === "start" ||
      key === "end" ||
      key === "confidence"
    ) {
      continue;
    }
    sanitized[key] = entryValue;
  }

  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIpAddress(hostname: string): boolean {
  const normalized =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split(".").map((part) => Number(part));
    return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  }

  return /^[a-f0-9:]+$/i.test(normalized) && normalized.includes(":");
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function detectDatasetFormat(
  filePath: string,
  explicitFormat: DatasetLoadOptions["format"],
): "csv" | "jsonl" {
  if (explicitFormat !== undefined) {
    return explicitFormat;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") {
    return "csv";
  }

  return "jsonl";
}
