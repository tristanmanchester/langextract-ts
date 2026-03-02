import type { AnnotatedDocument } from "../internal/annotation/index.js";
import { loadAnnotatedDocumentsJsonl } from "./io.js";

const PALETTE: readonly string[] = [
  "#D2E3FC",
  "#C8E6C9",
  "#FEF0C3",
  "#F9DEDC",
  "#FFDDBE",
  "#EADDFF",
  "#C4E9E4",
  "#FCE4EC",
  "#E8EAED",
  "#DDE8E8",
];

const VISUALIZATION_CSS = `<style>
.lx-highlight { position: relative; border-radius: 3px; padding: 1px 2px; }
.lx-current-highlight { border-bottom: 4px solid #ff4444; font-weight: bold; }
.lx-animated-wrapper { max-width: 100%; font-family: Arial, sans-serif; }
.lx-text-window { font-family: monospace; white-space: pre-wrap; border: 1px solid #90caf9; padding: 12px; line-height: 1.6; }
.lx-legend { font-size: 12px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
.lx-label { display: inline-block; padding: 2px 4px; border-radius: 3px; margin-right: 4px; color: #000; }
.lx-gif-optimized .lx-text-window { font-size: 16px; line-height: 1.8; }
</style>`;

export interface HighlightRange {
  start: number;
  end: number;
  label?: string;
  className?: string;
}

export interface RenderHighlightsOptions {
  text: string;
  highlights: readonly HighlightRange[];
  wrapInContainer?: boolean;
  showLegend?: boolean;
  gifOptimized?: boolean;
}

export type VisualizeInput = AnnotatedDocument | readonly AnnotatedDocument[] | string;

export interface VisualizeOptions {
  documentId?: string;
  wrapInContainer?: boolean;
  showLegend?: boolean;
  gifOptimized?: boolean;
}

interface HighlightPoint {
  position: number;
  type: "start" | "end";
  index: number;
  highlight: HighlightRange;
}

export function renderHighlightsHtml(options: RenderHighlightsOptions): string {
  const validHighlights = normalizeHighlights(options.text, options.highlights);
  if (validHighlights.length === 0) {
    const emptyBody =
      '<div class="lx-animated-wrapper"><p>No valid extractions to animate.</p></div>';
    return options.wrapInContainer === false ? emptyBody : VISUALIZATION_CSS + emptyBody;
  }

  const colorMap = assignColors(validHighlights);
  const highlightedText = buildHighlightedText(options.text, validHighlights, colorMap);

  const legendHtml =
    (options.showLegend ?? true)
      ? `<div class="lx-legend">Highlights Legend: ${Object.entries(colorMap)
          .map(
            ([label, color]) =>
              `<span class="lx-label" style="background-color:${color};">${escapeHtml(label)}</span>`,
          )
          .join(" ")}</div>`
      : "";

  const wrapperClass = `lx-animated-wrapper${(options.gifOptimized ?? true) ? " lx-gif-optimized" : ""}`;
  const body = `<div class="${wrapperClass}">${legendHtml}<div class="lx-text-window">${highlightedText}</div></div>`;

  if (options.wrapInContainer ?? true) {
    return VISUALIZATION_CSS + body;
  }

  return body;
}

export async function visualize(
  input: VisualizeInput,
  options: VisualizeOptions = {},
): Promise<string> {
  const documents = await normalizeVisualizeInput(input);
  if (documents.length === 0) {
    throw new Error("No annotated documents found to visualize.");
  }

  const document =
    options.documentId !== undefined
      ? documents.find((item) => item.document.id === options.documentId)
      : documents[0];
  if (document === undefined) {
    throw new Error(`Document ID not found in visualize input: ${options.documentId}`);
  }

  const highlights: HighlightRange[] = document.extractions.map((extraction) => ({
    start: extraction.start,
    end: extraction.end,
    label: extraction.label,
  }));

  return renderHighlightsHtml({
    text: document.document.text,
    highlights,
    ...(options.wrapInContainer !== undefined ? { wrapInContainer: options.wrapInContainer } : {}),
    ...(options.showLegend !== undefined ? { showLegend: options.showLegend } : {}),
    ...(options.gifOptimized !== undefined ? { gifOptimized: options.gifOptimized } : {}),
  });
}

export function assignColors(highlights: readonly HighlightRange[]): Record<string, string> {
  const labels = new Set<string>();
  for (const highlight of highlights) {
    const label = highlight.label ?? "unknown";
    labels.add(label);
  }

  const colorMap: Record<string, string> = {};
  const sorted = Array.from(labels).sort((a, b) => a.localeCompare(b));
  for (const [index, label] of sorted.entries()) {
    colorMap[label] = PALETTE[index % PALETTE.length] ?? "#ffff8d";
  }

  return colorMap;
}

function normalizeHighlights(
  text: string,
  highlights: readonly HighlightRange[],
): HighlightRange[] {
  return highlights
    .map((highlight) => ({
      ...highlight,
      start: clamp(Math.floor(highlight.start), 0, text.length),
      end: clamp(Math.floor(highlight.end), 0, text.length),
    }))
    .filter((highlight) => highlight.end > highlight.start)
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }

      const lengthA = a.end - a.start;
      const lengthB = b.end - b.start;
      return lengthB - lengthA;
    });
}

function buildHighlightedText(
  text: string,
  highlights: readonly HighlightRange[],
  colorMap: Record<string, string>,
): string {
  const points: HighlightPoint[] = [];
  const spanLengths = new Map<number, number>();

  for (const [index, highlight] of highlights.entries()) {
    points.push({
      position: highlight.start,
      type: "start",
      index,
      highlight,
    });
    points.push({
      position: highlight.end,
      type: "end",
      index,
      highlight,
    });
    spanLengths.set(index, highlight.end - highlight.start);
  }

  points.sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    if (a.type !== b.type) {
      return a.type === "end" ? -1 : 1;
    }

    const lengthA = spanLengths.get(a.index) ?? 0;
    const lengthB = spanLengths.get(b.index) ?? 0;

    if (a.type === "end") {
      return lengthA - lengthB;
    }

    return lengthB - lengthA;
  });

  const htmlParts: string[] = [];
  let cursor = 0;

  for (const point of points) {
    if (point.position > cursor) {
      htmlParts.push(escapeHtml(text.slice(cursor, point.position)));
    }

    if (point.type === "start") {
      const label = point.highlight.label ?? "unknown";
      const color = colorMap[label] ?? "#ffff8d";
      const highlightClass = point.index === 0 ? " lx-current-highlight" : "";
      const classAttribute = point.highlight.className
        ? ` ${escapeAttribute(point.highlight.className)}`
        : "";
      htmlParts.push(
        `<span class="lx-highlight${highlightClass}${classAttribute}" data-idx="${point.index}" style="background-color:${color};">`,
      );
    } else {
      htmlParts.push("</span>");
    }

    cursor = point.position;
  }

  if (cursor < text.length) {
    htmlParts.push(escapeHtml(text.slice(cursor)));
  }

  return htmlParts.join("");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

async function normalizeVisualizeInput(input: VisualizeInput): Promise<AnnotatedDocument[]> {
  if (typeof input === "string") {
    return loadAnnotatedDocumentsJsonl(input);
  }

  if (Array.isArray(input)) {
    return [...input];
  }

  return [input as AnnotatedDocument];
}
