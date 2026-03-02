import assert from "node:assert/strict";
import { test } from "vitest";

import { extract } from "../../src/public/extract.js";
import { getProviderRoutingMetadata, resolveModel } from "../../src/public/providers.js";

interface SmokeRoute {
  name: string;
  modelId: string;
  provider?: string;
  requiredEnvKeys: readonly string[];
  optionalGateEnv?: string;
}

const LIVE_SMOKE_ENABLED = process.env.LANGEXTRACT_LIVE_SMOKE === "1";
const REQUIRE_LIVE_CREDENTIALS = process.env.LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS === "1";

const ROUTES: readonly SmokeRoute[] = [
  {
    name: "gateway-default-alias",
    modelId: "google/gemini-3-flash",
    provider: "gateway",
    requiredEnvKeys: ["AI_GATEWAY_API_KEY", "LANGEXTRACT_API_KEY"],
  },
  {
    name: "google-direct",
    modelId: "google:gemini-3-flash",
    provider: "google",
    requiredEnvKeys: ["GEMINI_API_KEY", "LANGEXTRACT_API_KEY"],
  },
  {
    name: "openai-direct",
    modelId: "openai:gpt-4.1-mini",
    provider: "openai",
    requiredEnvKeys: ["OPENAI_API_KEY", "LANGEXTRACT_API_KEY"],
  },
  {
    name: "ollama-direct",
    modelId: "ollama:llama3.2",
    provider: "ollama",
    requiredEnvKeys: [],
    optionalGateEnv: "LANGEXTRACT_ENABLE_OLLAMA_SMOKE",
  },
];

function hasAnyKey(keys: readonly string[]): boolean {
  return keys.some((key) => (process.env[key] ?? "").trim().length > 0);
}

function listRequiredCredentialKeys(): string[] {
  return Array.from(
    new Set(ROUTES.flatMap((route) => route.requiredEnvKeys).filter((key) => key.length > 0)),
  ).sort((a, b) => a.localeCompare(b));
}

function isRouteEnabled(route: SmokeRoute): boolean {
  if (route.optionalGateEnv !== undefined && process.env[route.optionalGateEnv] !== "1") {
    return false;
  }

  if (route.requiredEnvKeys.length === 0) {
    return true;
  }

  return hasAnyKey(route.requiredEnvKeys);
}

const activeRoutes = ROUTES.filter((route) => isRouteEnabled(route));

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.trim();
  }

  return String(error);
}

function isRetriableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("temporar") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("500") ||
    message.includes("429")
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWithRetry<T>(
  operation: () => Promise<T>,
  routeName: string,
  attempts = 3,
): Promise<T> {
  let attemptError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      attemptError = error;
      const lastAttempt = attempt === attempts;
      if (lastAttempt || !isRetriableError(error)) {
        throw error;
      }

      const waitMs = Math.min(2000, attempt * 500);
      console.warn(
        `[live-smoke] retrying route=${routeName} attempt=${attempt + 1}/${attempts} after error=${getErrorMessage(error)} wait_ms=${waitMs}`,
      );
      await delay(waitMs);
    }
  }

  throw attemptError;
}

function assertExtractionIntervals(
  textLength: number,
  extractions: Array<{
    start: number;
    end: number;
    alignmentStatus: string;
  }>,
): void {
  for (const extraction of extractions) {
    assert.equal(Number.isInteger(extraction.start), true);
    assert.equal(Number.isInteger(extraction.end), true);
    assert.equal(typeof extraction.alignmentStatus, "string");

    if (extraction.start < 0 || extraction.end < 0) {
      continue;
    }

    assert.equal(extraction.start <= extraction.end, true);
    assert.equal(extraction.end <= textLength, true);
  }
}

if (!LIVE_SMOKE_ENABLED) {
  void test.skip("live smoke disabled (set LANGEXTRACT_LIVE_SMOKE=1 to enable)", () => {});
} else if (activeRoutes.length === 0) {
  const requiredKeys = listRequiredCredentialKeys();
  const message =
    "live smoke enabled but no provider credentials were found. " +
    `Set at least one of: ${requiredKeys.join(", ")}.`;
  if (REQUIRE_LIVE_CREDENTIALS) {
    void test("live smoke credential policy", () => {
      assert.fail(message);
    });
  } else {
    void test.skip(message, () => {});
  }
} else {
  void test("live smoke: default alias is still registered", () => {
    const metadata = getProviderRoutingMetadata();
    assert.equal(
      metadata.aliases.some(
        (entry) =>
          entry.alias === "google/gemini-3-flash" ||
          entry.alias === "gateway:google/gemini-3-flash",
      ),
      true,
    );
  });

  for (const route of activeRoutes) {
    void test(
      `live smoke: ${route.name}`,
      {
        timeout: 120_000,
      },
      async () => {
        const resolved = resolveModel({
          modelId: route.modelId,
          ...(route.provider !== undefined ? { provider: route.provider } : {}),
        });
        const startedAt = Date.now();
        const smokeText = "Alice moved to Berlin in 2024.";
        const result = await runWithRetry(
          () =>
            extract({
              text: smokeText,
              examples: [
                {
                  text: smokeText,
                  extractions: [{ extractionClass: "person", extractionText: "Alice" }],
                },
              ],
              modelId: route.modelId,
              ...(route.provider !== undefined ? { provider: route.provider } : {}),
              temperature: 0,
              // Keep smoke tests resilient to output-shape drift while still proving provider reachability.
              resolverParams: { suppress_parse_errors: true },
            }),
          route.name,
        );

        const durationMs = Date.now() - startedAt;
        assert.equal(result.document.document.text.includes("Alice"), true);
        assert.ok(Array.isArray(result.extractions));
        assertExtractionIntervals(result.document.document.text.length, result.extractions);
        console.info(
          `[live-smoke] route=${route.name} resolved=${resolved.provider}:${resolved.modelId} duration_ms=${durationMs} extractions=${result.extractions.length}`,
        );
      },
    );
  }
}
