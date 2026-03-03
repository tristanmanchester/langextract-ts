## Purpose

`@langextract-ts/langextract` is the TypeScript-native public package for
language extraction workflows. This package defines stable entrypoints and
contracts while implementation details stay behind internal module boundaries.

## Attribution

This package is an independent TypeScript port of the original Google
`langextract` project:

- [google/langextract](https://github.com/google/langextract)
- [Google announcement post](https://developers.googleblog.com/introducing-langextract-a-gemini-powered-information-extraction-library/)
- [langextract.com](https://langextract.com/)

It is not an official Google package.

## Install

```bash
# npm
npm i @langextract-ts/langextract

# pnpm
pnpm add @langextract-ts/langextract

# yarn
yarn add @langextract-ts/langextract

# bun
bun add @langextract-ts/langextract
```

Update to latest:

```bash
# npm
npm i @langextract-ts/langextract@latest

# pnpm
pnpm add @langextract-ts/langextract@latest
```

## Public API

Current public API surface:

- `extract`: extraction orchestration and high-level pipeline entrypoints.
- `io`: document/file input and output contracts.
- `progress`: terminal-friendly progress formatting and descriptors.
- `visualization`: result rendering and visual summary contracts.
- `providers`: model/provider wiring contracts for AI SDK v6 integrations.
- `types`: shared public type exports for callers and adapters.
- `errors`: exported error classes and error code contracts.

Public import example:

```ts
import { extract, createProviderRegistry } from "@langextract-ts/langextract";
```

Subpath entrypoint examples:

```ts
import { extract } from "@langextract-ts/langextract/extract";
import { resolveModel } from "@langextract-ts/langextract/providers";
```

Legacy compatibility aliases (for migration ergonomics):

- `@langextract-ts/langextract/extraction` -> `extract`
- `@langextract-ts/langextract/factory` -> `providers`
- `@langextract-ts/langextract/exceptions` -> `errors`

## Import Rules

- Import through package entrypoints only.
- Do not import from `src/internal/*`.
- Do not use relative imports across package boundaries.

## Provider Routing Policy

- Routing is registry-first: provider/model resolution flows through the
  provider registry before model creation.
- Default public model route is `google/gemini-3-flash`.
- Alias lifecycle policy for this route is documented as
  `Active -> Deprecated -> Sunset -> Removed` in migration docs.
- Sunset aliases are blocked by default; set
  `LANGEXTRACT_ALLOW_SUNSET_ALIASES=1` only for temporary migration overrides.

## Warning Codes

`extract(...)` supports `onWarning` and emits stable warning codes:

- `alias_lifecycle`: model alias is deprecated/sunset (routing still resolved).
- `batch_length_below_max_workers`: `maxWorkers` exceeds `batchLength`.
- `missing_examples`: examples were omitted for extraction calls.
- `prompt_alignment_failed`: prompt validation found extraction text that cannot
  align to source text.
- `prompt_alignment_non_exact`: prompt validation found non-exact alignment.
- `schema_fences_incompatible`: schema constraints are enabled while resolver
  fences are enabled for raw-output schema providers.
- `schema_wrapper_incompatible`: schema constraints are enabled while resolver
  wrapper key mode is enabled for raw-output schema providers.
- `schema_constraints_ignored_with_explicit_model`: caller provided `model`
  directly while enabling `useSchemaConstraints`.
- `provider_environment`: provider environment policy produced warnings (for
  example conflicting API key env vars).

## Validation Controls

`extract(...)` exposes two independent validation controls:

- `promptValidationLevel` (`off | warn | error`):
  controls example alignment preflight validation (`failed` / `non-exact`
  extraction alignment checks).
- `promptLintLevel` (`off | warn | error`, default `off`):
  controls prompt-string lint checks (empty prompt, unresolved template
  variables, missing JSON instruction when applicable).

Compatibility alias:

- `prompt_lint_level` is supported for snake_case callers.

Example:

```ts
import { extract } from "@langextract-ts/langextract";

await extract({
  textOrDocuments: "Invoice total is 124.50 EUR",
  promptDescription: "Extract the currency amount",
  examples: [
    {
      text: "Subtotal is 10.00 USD",
      extractions: [{ extractionClass: "amount", extractionText: "10.00 USD" }],
    },
  ],
  promptValidationLevel: "warn", // alignment preflight
  promptLintLevel: "off", // prompt lint (default is off)
});
```

## Status

Migration hardening is active. Public contracts above are versioned, covered by
parity-focused tests, and protected by architecture/release governance checks.
