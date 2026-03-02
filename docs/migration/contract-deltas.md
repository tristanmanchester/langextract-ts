# Migration Contract Deltas

This document records approved contract-level deltas from Python behavior while
the TypeScript implementation is migrated.

## Approval scope

- Date: 2026-03-02
- Applies to: `@langextract-ts/langextract` package boundary and tooling
- Status keys: `Approved`, `Implemented`, `Deferred`

## Approved deltas

| ID    | Delta                                                                                                                                                                                                        | Status      | Rationale                                                                                    | Acceptance criteria                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Adopt AI SDK v6 dependency baseline with compatible provider adapters (`ai`, `@ai-sdk/provider`, `@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`, `zod>=4.1.8`)           | Implemented | Aligns package contracts with AI SDK v6 model/provider interfaces and migration target state | Package dependency docs/manifests are aligned to AI SDK v6 baseline and install resolves cleanly                                  |
| D-002 | Set runtime floor to Node.js `>=20` for package consumers                                                                                                                                                    | Implemented | Uses current TypeScript/AI SDK ecosystem baseline and reduces polyfill complexity            | `engines.node` set to `>=20` in package manifest                                                                                  |
| D-003 | Move package toward publish-ready npm posture (`private: false`, dist files contract retained)                                                                                                               | Implemented | Enables package release flow during migration without waiting for full feature parity        | Package manifest is non-private and keeps explicit `files`/entrypoint contract                                                    |
| D-004 | Standardize TypeScript test tooling on Vitest with root + package scripts (`test`, `test:watch`, `test:coverage`)                                                                                            | Implemented | Creates fast feedback loop and coverage entrypoint before deeper feature migration           | Scripts exist at root and package; Vitest deps installed                                                                          |
| D-005 | Reserve TypeScript-native public API domains (`extract`, `io`, `progress`, `visualization`, `providers`, `types`, `errors`) before full implementation parity                                                | Implemented | Provides stable migration targets and enables contract-first incremental delivery            | Domains are exported/documented and tracked in parity matrix checkpoints                                                          |
| D-006 | Keep exports surface minimal during foundation phase (single package entrypoint, no internal path exposure)                                                                                                  | Implemented | Preserves deep-module boundaries and prevents early API sprawl                               | `check:package-contracts` passes and exports do not expose `src/internal/*`                                                       |
| D-007 | Use registry-first routing for public provider/model resolution                                                                                                                                              | Implemented | Keeps routing deterministic and plugin-extensible as provider integrations grow              | Resolution precedence is documented and tracked in parity checkpoints                                                             |
| D-008 | Define model alias lifecycle policy for default public route `google/gemini-3-flash` (`Active -> Deprecated -> Sunset -> Removed`)                                                                           | Implemented | Prevents breaking caller behavior when default alias targets evolve                          | Lifecycle stages and transition expectations are documented, exposed in routing metadata, and enforced in routing tests           |
| D-009 | Add backward-compatible legacy subpath exports for parity-friendly migration (`/extract`, `/providers`, `/io`, `/visualization`, `/types`, `/errors`, plus aliases `/extraction`, `/factory`, `/exceptions`) | Implemented | Enables incremental caller migration without deep imports or root-entrypoint lock-in         | Package exports include required subpaths, shim modules mirror root API domains, and release governance validates export presence |
| D-011 | Require a strict coverage gate command name at workspace root: `test:coverage:strict`                                                                                                                        | Implemented | Makes release and CI coverage enforcement explicit and auditable                             | Root `package.json` contains `scripts["test:coverage:strict"]` and deterministic CI runs that command                             |
| D-012 | Add release governance + provenance automation (`check:release-governance`, `release:check`, and `release-package.yml` using npm provenance)                                                                 | Implemented | Makes release readiness auditable and ensures provenance-enabled publish path is preserved   | Root scripts + release workflow exist, include provenance flags, and are validated by `check:release-governance`                  |
| D-014 | Require parity completion evidence artifact (`docs/migration/parity-final-report.md`) containing deterministic gate command evidence and live-smoke window status                                            | Implemented | Creates auditable, reproducible closure proof for the final parity gate                      | Release governance fails if report is missing required command evidence (`check`, `test`, `verify`, `test:coverage:strict`)       |

## Deferred deltas

| ID    | Candidate delta                                                              | Status   | Blocker                                                                  |
| ----- | ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| D-010 | Multi-runtime target (Node + edge-specific export maps)                      | Deferred | Requires finalized provider/runtime support matrix                       |
| D-013 | Replicate Python-specific Gemini batch/GCS transport internals in TS runtime | Deferred | Conflicts with AI SDK registry-first abstraction and locked parity scope |

## Change control

- Any new migration delta must add an ID here before implementation.
- Parity matrix updates must reference delta IDs, not ad-hoc notes.
- Release changes must include semver decision, `docs/AI_CHANGE_LOG.md` update,
  parity-matrix refresh, and contract-delta status review in one PR.

## Release checklist (required)

1. Record semver impact and planned version bump.
2. Update `docs/AI_CHANGE_LOG.md` with runtime/docs/CI summary.
3. Update `docs/migration/parity-matrix.md` statuses/checkpoints.
4. Update this file for new delta IDs or status transitions.
5. Verify `test:coverage:strict` command presence before release cut.
6. Verify `test:smoke:live` command presence for nightly/manual provider smoke.
7. Run `check:release-governance` and `release:check` before release workflow publish.
8. Update `docs/migration/parity-final-report.md` with current deterministic gate summaries and live-smoke completion window status.
