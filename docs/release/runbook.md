# Release Runbook

This runbook is the required path to cut `@langextract-ts/langextract` releases
with deterministic gates and npm provenance.

## Preconditions

1. Decide semver bump (`major`, `minor`, `patch`) and set
   `packages/langextract/package.json` version.
2. Update `docs/AI_CHANGE_LOG.md` with the release entry.
3. Update migration docs in the same PR:
   - `docs/migration/parity-matrix.md`
   - `docs/migration/contract-deltas.md`
4. Ensure npm token and OIDC permissions are available in CI for publishing.
5. Ensure `docs/migration/parity-final-report.md` exists and is updated for this release candidate.

## Local Gate

Run:

```bash
pnpm run release:check
```

This runs:

- `verify`
- `test:coverage:strict`
- `check:release-governance`

## Parity Completion Checklist

Before `publish=true`, complete both gate layers:

1. Deterministic gate:
   - `pnpm run check`
   - `pnpm run test`
   - `pnpm run verify`
   - `pnpm run test:coverage:strict`
2. Live-smoke completion window:
   - 3 consecutive green runs from `.github/workflows/live-smoke.yml`.
   - Record route diagnostics for each run:
     - gateway alias route
     - google direct route
     - openai direct route
     - optional ollama route (only when enabled).
3. Evidence updates:
   - update `docs/migration/parity-final-report.md` with deterministic command summaries,
     coverage summary, parity matrix mapping summary, and live-smoke run references.
   - keep `docs/migration/parity-matrix.md` and
     `docs/migration/contract-deltas.md` synchronized with parity status.

## CI Release Flow

Use the manual workflow:

- `.github/workflows/release-package.yml`

Inputs:

1. `publish=false` (default): provenance dry-run + tarball artifact.
2. `publish=true`: real npm publish with provenance.
3. `expected_version` (optional): fail fast if manifest version mismatches.

The workflow enforces:

- root release-governance scripts/contract presence
- required package subpath compatibility exports (including legacy aliases)
- deterministic release checks
- package build + tarball artifact upload
- provenance publish flags (`--provenance`)
- parity evidence artifact presence through release governance checks

## Live Smoke Credential Policy

- Live-smoke is schedule/manual only (`.github/workflows/live-smoke.yml`) and
  is credential-required by default through
  `LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1`.
- Smoke command: `pnpm run test:smoke:live`.
- Configure at least one live route credential set in CI secrets:
  - `AI_GATEWAY_API_KEY` or `LANGEXTRACT_API_KEY`
  - `GEMINI_API_KEY` or `LANGEXTRACT_API_KEY`
  - `OPENAI_API_KEY` or `LANGEXTRACT_API_KEY`
- Optional local-provider smoke:
  - set `LANGEXTRACT_ENABLE_OLLAMA_SMOKE=1` to include `ollama:llama3.2` route
    in live smoke (non-default, non-cloud gate).

## Rollback/Recovery

1. If publish fails before upload, fix and rerun workflow.
2. If publish succeeds with wrong metadata:
   - do not unpublish if avoidable;
   - patch forward with corrected version and changelog notes.
3. If live provider smoke failures appear post-release, treat as operational
   incident and route through alias/fallback policy updates.
