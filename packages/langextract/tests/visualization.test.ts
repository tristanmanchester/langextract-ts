import assert from "node:assert/strict";
import { test } from "vitest";

import { assignColors, renderHighlightsHtml } from "../src/public/visualization.js";

void test("assignColors is deterministic and sorted by class", () => {
  const colors = assignColors([
    { start: 0, end: 5, label: "CLASS_B" },
    { start: 6, end: 10, label: "CLASS_A" },
  ]);

  assert.deepEqual(Object.keys(colors), ["CLASS_A", "CLASS_B"]);
});

void test("renderHighlightsHtml builds expected single-span HTML", () => {
  const html = renderHighlightsHtml({
    text: "Hello world",
    highlights: [{ start: 0, end: 5, label: "GREETING" }],
    showLegend: false,
    gifOptimized: false,
  });

  assert.ok(html.includes('<span class="lx-highlight lx-current-highlight" data-idx="0"'));
  assert.ok(html.includes("Hello</span> world"));
});

void test("renderHighlightsHtml escapes html entities", () => {
  const html = renderHighlightsHtml({
    text: "Text with <unsafe> content",
    highlights: [{ start: 10, end: 18, label: "UNSAFE" }],
    showLegend: false,
    gifOptimized: false,
  });

  assert.ok(html.includes("&lt;unsafe&gt;"));
});

void test("renderHighlightsHtml returns no-valid-extractions output", () => {
  const html = renderHighlightsHtml({
    text: "No entities here.",
    highlights: [],
  });

  assert.ok(html.includes("No valid extractions to animate."));
});
