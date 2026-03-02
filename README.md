# langextract-ts

TypeScript migration of `langextract`, built on AI SDK v6.

This repo is an independent port of the original Google project:

- [google/langextract](https://github.com/google/langextract)
- [Introducing LangExtract (Google Developers Blog)](https://developers.googleblog.com/introducing-langextract-a-gemini-powered-information-extraction-library/)
- [langextract.com](https://langextract.com/)

It is not an official Google repository.
If you are looking for the original Python implementation, use `google/langextract`.

## What this repo contains

- `packages/langextract`: publishable package `@langextract-ts/langextract`
- `docs/migration`: parity matrix, contract deltas, and parity evidence
- `docs/release`: release runbook and release policy
- `.github/workflows`: deterministic CI and live smoke CI

## Quick start

Requirements:

- Node.js 20+
- pnpm 10+

Install:

```bash
pnpm install
```

Build package:

```bash
pnpm -C packages/langextract run build
```

## Basic extraction example

```ts
import { extract } from "@langextract-ts/langextract";

const result = await extract({
  text: "Alice moved to Berlin in 2024.",
  promptDescription: "Extract people and locations.",
  examples: [
    {
      text: "Bob moved to Paris.",
      extractions: [
        { extractionClass: "person", extractionText: "Bob" },
        { extractionClass: "location", extractionText: "Paris" },
      ],
    },
  ],
  modelId: "google/gemini-3-flash",
  provider: "gateway",
  temperature: 0,
  resolverParams: { suppress_parse_errors: true },
});

console.log(result.extractions);
```

## Test modes

Deterministic checks (no live provider required):

```bash
pnpm run check
pnpm run test
pnpm run verify
pnpm run test:coverage:strict
```

Live smoke (real provider credentials required):

```bash
LANGEXTRACT_LIVE_SMOKE=1 \
LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1 \
AI_GATEWAY_API_KEY=... \
pnpm run test:smoke:live
```

## Notes on input files

`langextract-ts` extracts from text, not raw PDF binaries. If your source is PDF,
convert it to text first, then pass the extracted text to `extract(...)`.

## Where to read more

- Package API and option docs: `packages/langextract/README.md`
- Migration and parity status: `docs/migration/parity-matrix.md`
- Contract-level deltas: `docs/migration/contract-deltas.md`
- Release workflow details: `docs/release/runbook.md`
