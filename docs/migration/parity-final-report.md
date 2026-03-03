# Parity Final Report

Date: 2026-03-02  
Scope: Final parity completion evidence for `@langextract-ts/langextract`

## Deterministic Gate Evidence

### `pnpm run check`

- Status: Passed
- Summary:
  - package contracts: passed
  - release governance: passed
  - architecture import checks: passed
  - lint (`lint:fast`): passed
  - typecheck: passed (`@langextract-ts/langextract`)

### `pnpm run test`

- Status: Passed
- Summary:
  - test files: `35 passed | 1 skipped` (`live/provider-smoke.test.ts` skipped in deterministic mode)
  - tests: `256 passed | 1 skipped`

### `pnpm run verify`

- Status: Passed
- Summary:
  - includes `check` + `lint:arch` + `format:check`
  - architecture fixture check: passed
  - Prettier format check: passed

### `pnpm run test:coverage:strict`

- Status: Passed
- Summary:
  - test files: `35 passed | 1 skipped`
  - tests: `256 passed | 1 skipped`
  - strict coverage gate command exited successfully

## Coverage Summary (Strict Gate)

- Overall (statements): `92.5%`
- Required module groups:
  - `extract`: threshold satisfied (strict gate passed; `src/public/extract.ts` statements `98.08%`)
  - `providers`: threshold satisfied (`src/internal/providers` statements `92.97%`)
  - `resolver`: threshold satisfied (`src/internal/resolver` statements `90.39%`)
  - `prompting`: threshold satisfied (`src/internal/prompting` statements `95.76%`)

## Release Preflight

- `pnpm run release:check`: Passed on 2026-03-02 (`verify` + `test:coverage:strict` + `check:release-governance`).
- `pnpm run release:check`: Passed on 2026-03-03 after release-workflow fixes.

## Release Workflow Evidence

- Dry-run workflow passed:
  - Run: `22607933823`
  - URL: `https://github.com/tristanmanchester/langextract-ts/actions/runs/22607933823`
  - Result: all deterministic checks + tarball artifact + publish dry-run passed.
- Publish workflow failed on npm auth/scope precondition:
  - Run: `22607974797`
  - URL: `https://github.com/tristanmanchester/langextract-ts/actions/runs/22607974797`
  - Failure: npm token in CI reported expired/revoked and publish returned `404` for `@langextract-ts/langextract`.
  - Status: release blocked pending refreshed npm token with publish rights for `@langextract-ts`.

## Parity Matrix Mapping Summary

- P-01 (routing parity): covered by `tests/factory-routing.test.ts`, `tests/providers.registry.test.ts`.
- P-02/P-03 (default alias + lifecycle): covered by `tests/extract.alias-lifecycle.test.ts`, routing/provider suites.
- P-04 (AI SDK v6 provider baseline): covered by provider/public-wrapper suites and governance/package checks.
- P-05 (API behavior parity expansion): covered by `extract`, `io-and-data-lib`, `progress`, `visualization`, `errors.codes`, and `public-init` suites.
- P-06 (strict coverage gate): enforced via `pnpm run test:coverage:strict` (passing).
- P-07 (release/provenance governance): enforced via `check:release-governance` (passing).
- P-08 (legacy subpath compatibility): validated by `tests/public-init.test.ts` and governance export/shim checks.
- P-09 (final parity completion gate): deterministic layer complete; live-smoke layer pending evidence window.
- Detailed checkpoint source of truth: `docs/migration/parity-matrix.md`.

## Live-Smoke Completion Window

Rule: 3 consecutive green runs from `.github/workflows/live-smoke.yml`.

Local manual smoke command status:

- `pnpm run test:smoke:live` executed on 2026-03-02: command succeeded but live suite was skipped (`1 skipped`) because no active live route credentials were available in this local environment.
- `pnpm run test:smoke:live` executed on 2026-03-03 with `AI_GATEWAY_API_KEY`: live smoke passed (`2 passed`) with route diagnostic:
  - `route=gateway-default-alias`
  - `resolved=gateway:google/gemini-3-flash-preview`
- `pnpm run test:smoke:live` executed on 2026-03-03 (repeat): live smoke passed (`2 passed`) with route diagnostic:
  - `route=gateway-default-alias`
  - `resolved=gateway:google/gemini-3-flash-preview`

| Run | Workflow run reference | Result  | Route diagnostics summary |
| --- | ---------------------- | ------- | ------------------------- |
| 1   | Pending CI evidence    | Pending | Pending                   |
| 2   | Pending CI evidence    | Pending | Pending                   |
| 3   | Pending CI evidence    | Pending | Pending                   |

Notes:

- Optional `ollama` route is only part of diagnostics when explicitly enabled.
- If a run fails due to provider transient conditions, capture replacement run notes.
- Deterministic parity gate is complete as of 2026-03-02; live-smoke window remains a CI/runtime credentialed step.
