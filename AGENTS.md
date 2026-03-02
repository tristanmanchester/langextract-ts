# AGENTS.md

## Purpose

This repository is the TypeScript reimplementation of `langextract`. Changes should preserve clear module boundaries and small public APIs so both humans and coding agents can work safely.

## Mandatory Global Skill (Always Use In This Repo)

For implementation/build/refactor work in this codebase, always apply:

- [$ai-codebase-deep-modules](/Users/tristan/.agents/skills/ai-codebase-deep-modules/SKILL.md)

Minimum required workflow before substantial changes:

1. Establish the fastest feedback loop command(s) first.
2. Define or confirm module boundaries and package entrypoints.
3. Keep implementation behind small module entrypoints.
4. Enforce boundary discipline (imports and coupling).
5. Validate with checks/tests before completion.

## Deep Modules Operating Model (Required)

Treat this repository as a deep-modules (greybox) codebase:

- Filesystem follows domain boundaries; avoid grab-bag utility folders.
- Each module exposes a small public API and hides implementation details in `internal/`.
- Outside code imports only from module/package entrypoints, not internal paths.
- Lock module behavior with contract tests at the public boundary.
- Refactors should follow a strangler pattern: interface first, adapter second, internals migrated incrementally.

For architecture/restructure tasks, produce this output shape:

1. Current state summary
2. Fast feedback loop commands
3. Module map
4. Proposed deep modules
5. Interface specs
6. Filesystem change plan
7. Boundary enforcement rules
8. Testing strategy (contract tests first)
9. Incremental migration checkpoints

## Repo Checks and Tooling

Run these as your default validation path:

- `pnpm run lint`
- `pnpm run check:architecture-imports`
- `pnpm run check:package-contracts`
- `pnpm run typecheck`
- `pnpm run check` before finalizing substantial changes
- `pnpm run verify` as the full pre-merge gate

## Non-Negotiable TypeScript Standards

- Import package APIs via package entrypoints, never `src/internal/*` paths.
- No cross-package relative imports.
- Keep adapters/framework edges thin; keep core business logic framework-agnostic.
- Prefer named exports for reusable modules.

## Completion Gate

A task is not complete until:

1. The deep-modules workflow was applied.
2. Architecture and package-contract checks pass.
3. Typecheck and lint pass.
4. The change summary explains which boundary or API constraints affected implementation.

## AI Change Log (Agent Memory)

- Canonical running log file: `docs/AI_CHANGE_LOG.md`.
- If `docs/AI_CHANGE_LOG.md` does not exist, create it.
- Append newest entries at the top (reverse chronological order).
- Add an entry for non-trivial fixes/refactors/decisions affecting behavior, APIs, architecture, or runbooks.

Template:

```md
## YYYY-MM-DD - <title>

Why:

- ...

Changed:

- `path/to/file`: ...

Validation:

- `pnpm ...` (pass/fail)

Open Risks / Follow-ups:

- ...

Tags: <comma,separated>
Type: <fix|feature|refactor|ops|decision>
Impact: <low|medium|high>
```
