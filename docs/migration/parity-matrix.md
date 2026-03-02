# Migration Parity Matrix

This matrix tracks Python-to-TypeScript migration parity at the package public
boundary.

## Migration goals

- Keep module boundaries strict and public APIs small.
- Reach behavior parity through contract-first increments.
- Keep package publishing and tooling ready throughout migration.

## AI SDK v6 parity baseline (2026-03-02)

| Area                   | Python baseline                                                     | TypeScript target                                                                          | Status                        | Delta ref   | Next checkpoint                                                                        |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Package boundary       | Public package import for main extraction API                       | Single public entrypoint export map with no internal leaks                                 | Completed                     | D-006       | Keep boundary checks hard-gated as modules expand                                      |
| Legacy subpath exports | Python module-style imports (`extraction`, `factory`, `exceptions`) | Subpath-compatible TS exports (`/extract`, `/providers`, `/errors`) plus migration aliases | Implemented (release-gated)   | D-009       | Keep subpath export contract tests and release-governance export checks enforced       |
| Extract API            | End-user extraction orchestration                                   | `extract` namespace/module public contract                                                 | Implemented (parity-tested)   | D-005       | Keep precedence/schema/validation/alias-lifecycle suites as regression guards          |
| IO API                 | Input and output adapters                                           | `io` namespace/module public contract                                                      | Implemented (parity-tested)   | D-005       | Keep JSONL + URL parity suites as regression guards                                    |
| Progress API           | Progress utilities and formatting                                   | `progress` namespace/module for runtime-safe progress descriptors and formatting helpers   | Implemented (parity-tested)   | D-005       | Keep progress parity suite as regression guard                                         |
| Visualization API      | Result rendering helpers                                            | `visualization` namespace/module public contract                                           | Implemented (parity-tested)   | D-005       | Keep overlap/nesting + deterministic HTML contract suites as regression guards         |
| Providers API          | Provider/model routing                                              | AI SDK v6-compatible provider surface                                                      | Implemented (parity-tested)   | D-001       | Keep lifecycle/registry/plugin/live-smoke suites green                                 |
| Provider routing       | Provider selection conventions                                      | Registry-first routing (registry resolves route before model instantiation)                | Implemented                   | D-007       | Keep precedence/fallback contract tests as regression guard                            |
| Default model alias    | Stable default model affordance                                     | Default public route alias `google/gemini-3-flash` with documented lifecycle               | Implemented (lifecycle-gated) | D-008       | Keep lifecycle enforcement tests and release checks wired                              |
| Public types           | Shared exportable type surface                                      | `types` namespace/module for stable caller contracts                                       | Implemented (parity-tested)   | D-005       | Keep warning/routing metadata contracts versioned and tested                           |
| Public errors          | Stable user-facing errors                                           | `errors` namespace/module with exported error codes/classes                                | Implemented (parity-tested)   | D-005       | Keep error-code mapping stable for provider/runtime/parse/alignment classes            |
| Runtime/tooling floor  | Varies in Python ecosystem                                          | Node.js >=20 baseline                                                                      | Completed                     | D-002       | Enforce in CI matrix and release docs                                                  |
| Test tooling           | Existing Python test harness                                        | Vitest scripts at root + package, with strict coverage gate command required               | Implemented (base)            | D-004       | Keep `test:coverage:strict` present and wired to deterministic CI gate before releases |
| Packaging              | Python package release flow                                         | npm package publish-ready baseline (`private: false`, dist files)                          | Completed (release-gated)     | D-003,D-012 | Keep release governance + provenance checks wired                                      |

## Parity checkpoints

| ID   | Scope                         | Delta ref | Status    | Exit criteria                                                                                                                         |
| ---- | ----------------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Registry-first routing parity | D-007     | Completed | Contract tests and docs confirm precedence: `provider` override, prefixed model ID, then default route                                |
| P-02 | Default alias activation      | D-008     | Completed | Default public route resolves to `google/gemini-3-flash` through registry APIs                                                        |
| P-03 | Alias lifecycle transition    | D-008     | Completed | Deprecation/sunset transition is documented and enforced by routing gates before alias removal                                        |
| P-04 | AI SDK v6 provider baseline   | D-001     | Completed | Migration docs/manifests are aligned to AI SDK v6 provider baseline                                                                   |
| P-05 | API behavior parity expansion | D-005     | Completed | `extract/io/progress/visualization/types/errors` contract suites cover current Python behavior deltas                                 |
| P-06 | Strict coverage gate wiring   | D-011     | Completed | `test:coverage:strict` exists and is enforced in deterministic CI prior to release cut                                                |
| P-07 | Release/provenance governance | D-012     | Completed | Release workflow includes provenance publish path and root release-governance checks are enforced                                     |
| P-08 | Legacy subpath compatibility  | D-009     | Completed | Package exports provide subpath entrypoints + compatibility aliases without internal-path leaks                                       |
| P-09 | Final parity completion gate  | D-014     | Completed | Parity completion requires deterministic gate (`check`,`test`,`verify`,`test:coverage:strict`) and a 3-run live-smoke evidence window |

## Release checklist (required)

1. Record semver decision (`major`/`minor`/`patch`) before tagging.
2. Add release entry to `docs/AI_CHANGE_LOG.md` summarizing runtime + docs + CI deltas.
3. Update this parity matrix statuses/checkpoints in the same change set.
4. Update `docs/migration/contract-deltas.md` for any new/changed delta IDs or statuses.
5. Confirm root script `test:coverage:strict` is present before release branch merge.
6. Confirm root script `test:smoke:live` is present for nightly/manual provider verification.
7. Run `check:release-governance` and `release:check` before release workflow publish.
8. Confirm parity completion evidence is up to date in `docs/migration/parity-final-report.md` and includes deterministic + live-smoke window status.

## Notes

- Statuses marked "Implemented (parity-tested)" indicate parity suites exist and
  are expected to remain as regression guards.
- Deltas are documented in `docs/migration/contract-deltas.md`.
- Python-specific Gemini batch/GCS transport internals remain a deferred
  non-goal under D-013 while TS keeps AI SDK registry-first abstraction.
- Release procedure is documented in `docs/release/runbook.md`.
