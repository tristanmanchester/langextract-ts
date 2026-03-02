import assert from "node:assert/strict";
import { test } from "vitest";

import { assignColors, renderHighlightsHtml } from "../src/public/visualization.js";

void test("assignColors is deterministic across repeated/unsorted labels", () => {
  const colors = assignColors([
    { start: 0, end: 1, label: "B" },
    { start: 2, end: 3, label: "A" },
    { start: 4, end: 5, label: "B" },
  ]);

  assert.deepEqual(Object.keys(colors), ["A", "B"]);
  assert.equal(colors.A !== undefined, true);
  assert.equal(colors.B !== undefined, true);
});

void test("renderHighlightsHtml can omit CSS container wrapper", () => {
  const html = renderHighlightsHtml({
    text: "Hello world",
    highlights: [{ start: 0, end: 5, label: "GREETING" }],
    wrapInContainer: false,
  });

  assert.equal(html.startsWith("<style>"), false);
  assert.match(html, /class="lx-animated-wrapper lx-gif-optimized"/);
});

void test("renderHighlightsHtml legend escapes label content", () => {
  const html = renderHighlightsHtml({
    text: "Alice <Berlin>",
    highlights: [{ start: 0, end: 5, label: 'PERSON<"unsafe">' }],
    showLegend: true,
  });

  assert.match(html, /Highlights Legend:/);
  assert.match(html, /PERSON&lt;&quot;unsafe&quot;&gt;/);
});

void test("renderHighlightsHtml clamps ranges, filters invalid spans, and escapes className", () => {
  const html = renderHighlightsHtml({
    text: "abcdef",
    highlights: [
      { start: -10, end: 2, label: "A", className: 'x" onclick="bad' },
      { start: 4, end: 30, label: "B" },
      { start: 3, end: 3, label: "IGNORED" },
    ],
  });

  assert.match(html, /data-idx="0"/);
  assert.match(html, /data-idx="1"/);
  assert.equal(html.includes("IGNORED"), false);
  assert.equal(html.includes('onclick="bad'), false);
  assert.match(html, /x&quot; onclick=&quot;bad/);
});

void test("renderHighlightsHtml preserves stable ordering for overlapping highlights", () => {
  const html = renderHighlightsHtml({
    text: "abcde",
    highlights: [
      { start: 0, end: 5, label: "OUTER" },
      { start: 1, end: 3, label: "INNER" },
    ],
    showLegend: false,
    gifOptimized: false,
  });

  assert.match(
    html,
    /<span class="lx-highlight lx-current-highlight" data-idx="0"[^>]*>a<span class="lx-highlight" data-idx="1"[^>]*>bc<\/span>de<\/span>/,
  );
  assert.equal(/class="lx-animated-wrapper lx-gif-optimized"/.test(html), false);
});

void test("renderHighlightsHtml empty highlights with wrapInContainer=false returns bare body", () => {
  const html = renderHighlightsHtml({
    text: "No entities",
    highlights: [],
    wrapInContainer: false,
  });

  assert.equal(html.startsWith("<style>"), false);
  assert.match(html, /No valid extractions to animate\./);
});
