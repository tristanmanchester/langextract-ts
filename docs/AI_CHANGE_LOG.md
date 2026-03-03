## 2026-03-03 - Public launch metadata + Apache 2.0 licensing

Why:

- The package was technically release-ready, but OSS and npm trust metadata was
  incomplete for public launch.

Changed:

- Added Apache 2.0 license file at repo root:
  - `LICENSE`
- Updated workspace and package license metadata:
  - `package.json` (`license: "Apache-2.0"`)
  - `packages/langextract/package.json` (`license: "Apache-2.0"`)
- Added npm-facing package metadata in
  `packages/langextract/package.json`:
  - `description`
  - `keywords`
  - `author`
  - `repository`
  - `homepage`
  - `bugs`
  - `publishConfig.access: "public"`
- Added workspace repository metadata in `package.json`:
  - `repository`
  - `homepage`
  - `bugs`
- Hardened release workflow in `.github/workflows/release-package.yml`:
  - fixed expected-version validation shell quoting;
  - switched artifact path from hidden `.artifacts` to `artifacts` for reliable upload;
  - fixed publish command execution context (`cd packages/langextract`);
  - removed unsupported `--provenance` from dry-run publish (kept for real publish);
  - added npm preflight checks (`npm whoami`, `npm view @langextract-ts/langextract version`) before publish steps.
- Updated release runbook preconditions in `docs/release/runbook.md` with explicit npm auth/scope checks.
- Updated parity evidence in `docs/migration/parity-final-report.md` with:
  - passing dry-run workflow run reference,
  - publish-run blocker details (expired/revoked CI npm token / missing scope rights),
  - additional live-smoke evidence on 2026-03-03.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run check`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run release:check`
- `AI_GATEWAY_API_KEY=*** LANGEXTRACT_LIVE_SMOKE=1 LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1 pnpm -C /Users/tristan/Projects/langextract/langextract-ts --filter @langextract-ts/langextract run test:smoke:live`

Open Risks / Follow-ups:

- npm publish permissions are still blocked on local auth
  (`npm whoami` requires login).
- GitHub Actions release workflow dispatch/publish still requires verified
  repository + npm credentials in CI environment.

Tags: release,metadata,license,packaging
Type: feature
Impact: medium

## 2026-03-02 - Public `extract(...)` prompt lint control (`promptLintLevel`)

Why:

- Prompt-lint behavior was made parity-default `off` at the annotation pipeline
  level, but public `extract(...)` did not yet expose explicit lint-level
  control.

Changed:

- `packages/langextract/src/public/extract.ts`:
  - added public option `promptLintLevel?: \"off\" | \"warn\" | \"error\"`;
  - added snake_case alias `prompt_lint_level`;
  - wired resolved prompt lint level into `AnnotatorPipeline`.
- `packages/langextract/tests/extract.settings.test.ts`:
  - added coverage for default lint-off behavior with custom templates;
  - added coverage for `promptLintLevel: \"error\"` enforcement path
    (`PromptValidationError`);
  - added coverage for `prompt_lint_level` alias behavior.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- `promptValidationLevel` continues to govern alignment validation; callers who
  need prompt-lint enforcement must now opt in using `promptLintLevel`.

Tags: extract,prompting,api,parity
Type: feature
Impact: medium

## 2026-03-02 - Legacy subpath runtime shims + governance enforcement

Why:

- Legacy compatibility exports existed in package metadata, but parity hardening
  required explicit runtime shim modules and governance checks to prevent alias
  regressions.

Changed:

- Added dedicated legacy runtime shims:
  - `packages/langextract/src/extraction.ts`
  - `packages/langextract/src/factory.ts`
  - `packages/langextract/src/exceptions.ts`
- Updated alias exports in `packages/langextract/package.json` to target
  dedicated dist shim files:
  - `./extraction -> ./dist/extraction.*`
  - `./factory -> ./dist/factory.*`
  - `./exceptions -> ./dist/exceptions.*`
- Expanded runtime contract tests in
  `packages/langextract/tests/public-init.test.ts` to import legacy shims and
  assert they mirror canonical APIs.
- Hardened `scripts/check-release-governance.mjs` to enforce:
  - legacy alias export paths are pinned to dedicated dist shim files;
  - required legacy alias source shim files exist.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Alias shim governance currently covers the three locked legacy aliases only;
  new aliases should be added to both package exports and governance constants.

Tags: compatibility,exports,governance,parity
Type: feature
Impact: medium

## 2026-03-02 - Prompt-lint parity default in annotation pipeline

Why:

- Python parity focuses extraction-time alignment validation; TS annotation
  pipeline was additionally enforcing prompt-lint validation by default.

Changed:

- `packages/langextract/src/internal/annotation/annotator.ts`:
  - added `promptLintLevel` option;
  - default prompt-lint enforcement is now `off` (parity-default behavior);
  - lint validation can still be enabled explicitly via
    `promptLintLevel: "warn" | "error"`.
- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added coverage proving default lint-off behavior and explicit lint-on
    behavior (`PromptValidationError` path).

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- If callers relied on implicit prompt-lint failures in direct
  `AnnotatorPipeline` usage, they now need to opt in with `promptLintLevel`.

Tags: annotation,prompting,parity
Type: feature
Impact: medium

## 2026-03-02 - Alignment/resolver parity closure + public contract test expansion

Why:

- Remaining parity audits flagged behavior drift in alignment classification
  and parse-suppression scope, plus missing contract coverage for some public
  wrappers and release-doc governance checks.

Changed:

- Resolver/alignment behavior:
  - `packages/langextract/src/internal/resolver/resolver.ts` now suppresses only
    `FormatParseError` when `suppressParseErrors` is enabled; unexpected parser
    exceptions are no longer silently swallowed.
  - `packages/langextract/src/internal/resolver/word-aligner.ts` now treats
    case-only matches as `exact` and adds normalized lesser-alignment matching
    for punctuation/spacing variants (for example `type-2` vs `Type 2`).
- Test parity/contract expansion:
  - updated resolver/prompt/extract tests for case-insensitive exact behavior
    and suppress-parse scope:
    - `tests/resolver.align.test.ts`
    - `tests/resolver.parse.test.ts`
    - `tests/resolver.test.ts`
    - `tests/resolver.parity.test.ts`
    - `tests/prompt-validation.test.ts`
    - `tests/extract.test.ts`
  - expanded public wrapper coverage:
    - `tests/progress.parity.test.ts` now covers `createExtractionPostfix`.
    - `tests/providers.public-wrappers.test.ts` now covers
      `getDefaultProviderRegistry`, `resolveProviderEnvironment`, and
      `DEFAULT_PUBLIC_GATEWAY_MODEL_ID`.
  - expanded extract option-branch coverage: - `tests/extract.format-none.test.ts` now covers `formatType/format_type:
"yaml"` prompt wiring. - `tests/extract.settings.test.ts` now covers non-finite/non-numeric
    fuzzy-threshold validation paths.
  - tightened export-contract checks in `tests/public-init.test.ts` for legacy
    alias mapping equality (`./extraction`, `./factory`, `./exceptions`).
- Docs/governance hardening:
  - `docs/migration/parity-matrix.md` wording updated to reflect deterministic
    HTML contract suites (instead of snapshot wording).
  - `docs/release/runbook.md` now uses portable `pnpm run release:check` and
    explicitly names `test:smoke:live`.
  - `scripts/check-release-governance.mjs` now also validates
    `docs/release/runbook.md` + `docs/AI_CHANGE_LOG.md` presence/requirements
    and fails if runbook includes machine-specific `/Users/` paths.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Governance runbook path checks are intentionally opinionated (`/Users/`
  pattern) and may need widening if additional absolute-path variants are seen.

Tags: resolver,alignment,parity,contracts,governance
Type: feature
Impact: medium

## 2026-03-02 - Release governance hardening for CI profile split

Why:

- `check:release-governance` validated release artifacts and scripts, but did
  not enforce the workflow-level contract that PR gates stay offline while live
  smoke stays nightly/manual only.

Changed:

- `scripts/check-release-governance.mjs`:
  - added required presence checks for
    `.github/workflows/pr-offline-deterministic.yml` and
    `.github/workflows/live-smoke.yml`;
  - added PR workflow policy checks for deterministic gate steps (`verify`,
    `test`, `test:coverage:strict`) and `LANGEXTRACT_LIVE_SMOKE="0"`;
  - added live-smoke policy checks for schedule/manual triggers,
    `LANGEXTRACT_LIVE_SMOKE="1"`,
    `LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS="1"`, and
    `pnpm run test:smoke:live`;
  - added a guard that fails if live-smoke workflow reintroduces
    `pull_request` triggers.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`

Open Risks / Follow-ups:

- Governance checks rely on required snippet presence and are intentionally
  lightweight; if workflows become more dynamic, this may need a structured
  YAML parser check.

Tags: release,ci,governance,hardening
Type: feature
Impact: medium

## 2026-03-02 - `showProgress` parity wiring in annotation pipeline

Why:

- `showProgress` was previously wired through extract options but had no runtime
  effect in the annotation pipeline.

Changed:

- `packages/langextract/src/internal/annotation/annotator.ts`:
  - added progress emission during chunk processing;
  - added `onProgress` callback support for structured progress updates;
  - added safe TTY fallback rendering when `showProgress` is enabled and no
    callback is provided.
- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added regression tests verifying progress updates are emitted when enabled
    and suppressed when `showProgress: false`.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- TTY rendering is intentionally conservative (`CI`/non-TTY disabled) and may be
  expanded in future if richer terminal progress output is required.

Tags: annotation,progress,parity
Type: feature
Impact: medium

## 2026-03-02 - `debug` parity wiring for model-call diagnostics

Why:

- `debug` was previously accepted by extraction options but did not change
  runtime behavior in annotation execution paths.

Changed:

- `packages/langextract/src/internal/annotation/annotator.ts`:
  - model-call events now include debug diagnostics when `debug: true`:
    `promptChars`, `outputChars`, `promptPreview`, and `outputPreview`.
- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added regression coverage for debug-enabled event enrichment and
    debug-disabled event omission.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Debug previews are intentionally truncated and whitespace-normalized; if richer
  structured diagnostics are needed, a dedicated debug callback surface may be
  introduced later.

Tags: annotation,debug,telemetry,parity
Type: feature
Impact: medium

## 2026-03-02 - Structural `resolverParams.format_handler` parity support

Why:

- Public resolver params exposed `format_handler`, but TS previously only
  accepted an internal `FormatHandler` instance, making this option impractical
  for external callers.

Changed:

- `packages/langextract/src/internal/resolver/format-handler.ts`:
  - `FormatHandler.fromResolverParams(...)` now accepts structural
    `format_handler` objects (snake_case or camelCase fields) and normalizes
    them to a `FormatHandler` instance;
  - added strict type validation for structural `format_handler` fields.
- `packages/langextract/tests/resolver.parse.test.ts`:
  - added tests for structural object acceptance, shape validation, and
    camelCase/snake_case compatibility paths.
- `packages/langextract/src/public/types.ts`:
  - added `ResolverFormatHandlerConfig` and tightened
    `ExtractResolverParams.format_handler` to use this structural public type.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Structural format-handler typing is now explicit; additional public API docs
  can be expanded with concrete usage examples.

Tags: resolver,format-handler,parity,api
Type: feature
Impact: medium

## 2026-03-02 - Annotation parity tests: per-document context isolation and chunk-offset alignment

Why:

- Lock in Python parity behaviors for multi-document context windows and chunked
  alignment offsets at the annotation pipeline boundary.

Changed:

- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added per-document context isolation test ensuring context from one document
    does not bleed into another in multi-document chunked annotation runs;
  - added chunk-offset alignment test ensuring extraction `start/end` are mapped
    to full-document coordinates across multiple chunks.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Resolver-level chunk/discontinuous-token interval parity still needs deeper
  direct coverage mirroring advanced Python resolver cases.

Tags: annotation,chunking,resolver,parity,tests
Type: test
Impact: medium

## 2026-03-02 - Additional parity tests for disabled context windows and discontinuous token intervals

Why:

- Expand contract coverage for two Python parity edge cases:
  - context-window disable semantics during chunked annotation,
  - discontinuous token metadata handling for interval-based chunk text reads.

Changed:

- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added regression test ensuring no `Previous chunk context:` prefix is added
    when `contextWindowChars` is unset.
- `packages/langextract/tests/chunking.parity.test.ts`:
  - added discontinuous-token metadata case where positional intervals still
    resolve valid text;
  - added invalid interval assertion (`endIndex` past token array bounds) using
    `InvalidTokenIntervalError`.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Advanced Python resolver cases using token-offset-aware align internals are
  only partially representable in the current TS resolver abstraction.

Tags: annotation,chunking,tokenizer,parity,tests
Type: test
Impact: medium

## 2026-03-02 - `formatType: "none"` prompt validation parity fix

Why:

- `AnnotatorPipeline` still required JSON-instruction validation even when
  running in `formatType: "none"` mode, which was inconsistent with the
  intended non-structured prompt behavior.

Changed:

- `packages/langextract/src/internal/annotation/annotator.ts`:
  - `enforcePromptValidation(...).requireJsonInstruction` is now disabled when
    `formatType === "none"`.
- `packages/langextract/tests/annotation.pipeline.test.ts`:
  - added regression coverage ensuring `promptValidationLevel: "error"` does not
    fail solely due to missing JSON instructions in `formatType: "none"` mode.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- `formatType: "none"` still resolves outputs through the structured resolver
  path for extraction reconstruction; transport-level raw freeform parsing
  remains intentionally out of scope for this iteration.

Tags: prompting,validation,format-none,parity
Type: fix
Impact: medium

## 2026-03-02 - Fuzzy alignment threshold validation parity hardening

Why:

- Close a resolver parity gap where invalid `fuzzy_alignment_threshold` values
  could pass through and produce inconsistent alignment behavior.

Changed:

- `packages/langextract/src/public/extract.ts`:
  - added strict validation for `resolverParams.fuzzy_alignment_threshold` /
    `resolverParams.fuzzyAlignmentThreshold`;
  - now throws `InferenceConfigError` when the value is non-finite or outside
    `[0, 1]`.
- `packages/langextract/src/internal/resolver/resolver.ts`:
  - validates `fuzzyAlignmentThreshold` in constructor and per-call overrides;
  - tightened numeric validation to reject non-finite values.
- Tests:
  - `packages/langextract/tests/extract.settings.test.ts` (new invalid-threshold
    extract preflight test),
  - `packages/langextract/tests/resolver.parse.test.ts` (range validation cases),
  - `packages/langextract/tests/resolver.align.test.ts` (runtime override range
    validation).

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Additional runtime-option validation hardening can be extended to other
  numeric knobs if Python parity requires stricter bounds.

Tags: resolver,alignment,parity,validation
Type: feature
Impact: medium

## 2026-03-02 - CI profile lock: live smoke is nightly/manual only

Why:

- Align CI behavior with locked migration policy: PR gating remains deterministic
  and offline; live provider smoke runs only in nightly/manual profiles.

Changed:

- `.github/workflows/live-smoke.yml`:
  - removed `pull_request` trigger;
  - removed PR-only `continue-on-error` behavior;
  - set `LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1` unconditionally.
- `docs/release/runbook.md`:
  - updated live-smoke policy text to schedule/manual-only and
    credential-required-by-default.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`

Open Risks / Follow-ups:

- Manual smoke dispatches now require configured provider credentials; this is
  intentional and mirrors nightly behavior.

Tags: ci,live-smoke,release-governance
Type: ops
Impact: medium

## 2026-03-02 - `formatType: \"none\"` compatibility mode

Why:

- Add parity-friendly support for non-structured prompt mode equivalent to
  Python scenarios where format forcing is intentionally disabled.

Changed:

- `packages/langextract/src/public/extract.ts`:
  - `formatType`/`format_type` now accepts `"none"` in addition to
    JSON/YAML modes;
  - resolver base format remains JSON-backed for parsing stability when using
    `"none"` prompt mode.
- `packages/langextract/src/internal/annotation/annotator.ts`:
  - prompt builder now receives output format information, including `"none"`.
- `packages/langextract/src/internal/prompting/context-aware-prompt-builder.ts`:
  - added `outputFormat` support (`json`/`yaml`/`none`);
  - `"none"` mode now avoids JSON/YAML forcing instructions.
- `packages/langextract/src/internal/prompting/template.ts`:
  - replaced hardcoded JSON instruction line with `{{outputInstructions}}`
    placeholder.
- Tests:
  - `packages/langextract/tests/extract.format-none.test.ts` (new)
  - `packages/langextract/tests/prompting.parity-extra.test.ts` (expanded for
    `"none"` mode prompt behavior).

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Non-structured prompt mode is intentionally less deterministic for structured
  extraction outputs and is primarily a compatibility path.

Tags: extract,prompting,parity,compatibility
Type: feature
Impact: medium

## 2026-03-02 - Provider kwargs parity hardening (Google allow-list + nullish filtering)

Why:

- Close remaining provider-kwargs parity gaps against Python behavior for
  runtime parameter filtering and normalization.

Changed:

- `packages/langextract/src/public/extract.ts`:
  - added provider-aware language-model param filtering for `google` route
    using an explicit allow-list;
  - added nullish (`null`/`undefined`) filtering for runtime
    `languageModelParams`;
  - kept falsy numerics (for example `0`) intact;
  - retained and extended normalization for `reasoning_effort` and
    `response_format` aliases.
- `packages/langextract/tests/extract.kwargs-parity.test.ts` (new):
  - `google` allow-list behavior and unknown-key filtering;
  - nullish-drop + zero-preserve behavior;
  - `openai` custom passthrough + reasoning merge + alias normalization.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Full provider transport parity for Python-specific adapters remains out of
  scope under deferred transport delta D-013.

Tags: providers,kwargs,parity,tests
Type: feature
Impact: medium

## 2026-03-02 - Live smoke parity hardening (retries, interval checks, optional Ollama route)

Why:

- Improve live smoke robustness and align closer to Python live-test structure
  without converting smoke into semantic quality gating.

Changed:

- `packages/langextract/tests/live/provider-smoke.test.ts`:
  - added transient-error retry/backoff wrapper for live extraction calls;
  - added extraction interval/alignment structural assertions;
  - added optional Ollama smoke route gated by
    `LANGEXTRACT_ENABLE_OLLAMA_SMOKE=1`.
- `docs/release/runbook.md`: documented optional Ollama smoke route behavior.
- `docs/migration/contract-deltas.md`: added deferred non-goal D-013 for
  Python-specific Gemini batch/GCS transport internals.
- `docs/migration/parity-matrix.md`: added D-013 note clarifying deferred
  transport scope.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`

Open Risks / Follow-ups:

- Provider live-smoke still depends on credential availability and external
  provider uptime.

Tags: live-smoke,providers,parity,docs
Type: ops
Impact: medium

## 2026-03-02 - Progress parity utilities + schema-format warning closure

Why:

- Close remaining Python parity gaps around progress helper APIs and
  schema-format compatibility warnings for raw-output provider schemas.
- Harden provider/runtime parameter handling for kwargs-style compatibility.

Changed:

- `packages/langextract/src/public/progress.ts`: added TS-native progress
  helpers mirroring Python parity semantics (`create*ProgressBar`,
  `getModelInfo`, extraction progress/stat formatters).
- `packages/langextract/src/index.ts`: exported progress API at root.
- `packages/langextract/src/progress.ts`: added subpath shim entrypoint.
- `packages/langextract/package.json`: added `./progress` export.
- `scripts/check-release-governance.mjs`: added required export check for
  `./progress`.
- `packages/langextract/src/public/extract.ts`:
  - added schema-format compatibility warnings when raw-output schema hooks are
    used with incompatible fence/wrapper settings;
  - added provider-schema hook return-shape validation;
  - added normalization for `languageModelParams` aliases
    (`reasoning_effort`/`reasoningEffort`, `response_format`) and reasoning
    merge semantics.
- `packages/langextract/src/public/types.ts`: added stable warning codes
  `schema_fences_incompatible` and `schema_wrapper_incompatible`.
- `packages/langextract/src/internal/resolver/resolver.ts`: exposed
  `formatHandler` in resolver factory result for compatibility diagnostics.
- `packages/langextract/src/internal/providers/registry.ts`: added runtime
  validation for provider schema hook contract shape.
- Tests:
  - `packages/langextract/tests/progress.parity.test.ts` (new)
  - `packages/langextract/tests/extract.schema.test.ts` (expanded)
  - `packages/langextract/tests/extract.settings.test.ts` (expanded kwargs
    normalization/merge coverage)
  - `packages/langextract/tests/providers.registry.test.ts` (expanded schema
    hook validation)
  - `packages/langextract/tests/providers.schema.test.ts` (expanded
    table-driven schema synthesis parity)
  - `packages/langextract/tests/public-init.test.ts` (progress export contract)
- Docs:
  - `packages/langextract/README.md` (public `progress` API domain)
  - `docs/migration/contract-deltas.md` (D-005 domain list includes `progress`)
  - `docs/migration/parity-matrix.md` (Progress API row + P-05 wording update)

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run check`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Python-specific provider transport internals (Gemini batch/GCS flows) remain
  intentionally out of scope for TS AI SDK registry-first architecture.

Tags: progress,schemas,warnings,providers,parity
Type: feature
Impact: medium

## 2026-03-02 - Legacy subpath compatibility exports

Why:

- Close deferred migration delta D-009 so callers can migrate incrementally
  using subpath imports without deep-importing internals.

Changed:

- `packages/langextract/src/*.ts`: added top-level public shim entrypoints for
  `extract`, `providers`, `io`, `visualization`, `types`, and `errors`.
- `packages/langextract/package.json`: added subpath exports for:
  - primary public subpaths: `/extract`, `/providers`, `/io`,
    `/visualization`, `/types`, `/errors`;
  - compatibility aliases: `/extraction`, `/factory`, `/exceptions`.
- `packages/langextract/tests/public-init.test.ts`: expanded contract tests for
  shim equivalence and required export-map coverage.
- `scripts/check-release-governance.mjs`: added required subpath export checks
  so release gates fail if compatibility exports regress.
- `packages/langextract/README.md`: documented subpath usage and legacy alias
  mapping.
- `docs/migration/contract-deltas.md`: marked D-009 implemented.
- `docs/migration/parity-matrix.md`: added legacy subpath area and checkpoint
  P-08 as completed.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run check`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Multi-runtime export-map support (D-010) remains deferred.

Tags: exports,compatibility,governance,docs
Type: feature
Impact: medium

## 2026-03-02 - Live smoke credential policy enforcement

Why:

- Prevent silent green nightly/manual live-smoke runs when provider credentials
  are missing.

Changed:

- `packages/langextract/tests/live/provider-smoke.test.ts`:
  - added `LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS` support;
  - when enabled and no route credentials are available, test now fails with an
    actionable env-key message instead of skipping.
- `.github/workflows/live-smoke.yml`:
  - set `LANGEXTRACT_REQUIRE_LIVE_CREDENTIALS=1` for non-PR runs and `0` for PRs;
  - wired provider credential env variables from secrets.
- `docs/release/runbook.md`: documented live-smoke credential policy and
  required secret keys.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:smoke:live`

Open Risks / Follow-ups:

- Scheduled/manual live-smoke runs will fail until at least one provider route
  has valid credentials configured in repository secrets.

Tags: live-smoke,ci,credentials
Type: ops
Impact: medium

## 2026-03-02 - Release governance and provenance automation

Why:

- Close the remaining packaging follow-up by making release/provenance checks
  enforceable in scripts and CI workflows.

Changed:

- `scripts/check-release-governance.mjs`: new release-governance contract check
  for required root scripts, release workflow provenance flags, package publish
  posture, and migration checklist references.
- `package.json`: added `check:release-governance` and `release:check`; wired
  release-governance checks into `check`.
- `.github/workflows/release-package.yml`: new manual release workflow with:
  - deterministic release checks,
  - optional expected version guard,
  - package tarball artifact upload,
  - npm provenance dry-run/publish paths (`--provenance`).
- `docs/release/runbook.md`: added concrete release runbook for local + CI.
- `docs/migration/contract-deltas.md`: added D-012 for release/provenance
  governance automation.
- `docs/migration/parity-matrix.md`: marked Packaging as release-gated and
  added checkpoint P-07 for release/provenance governance.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:smoke:live`

Open Risks / Follow-ups:

- Real publish path requires `NPM_TOKEN` + OIDC availability in CI at release
  time.

Tags: release,ci,provenance,governance
Type: ops
Impact: medium

## 2026-03-02 - Live smoke workflow gate hardening

Why:

- Enforce the live-smoke contract command in CI so nightly/manual provider
  verification cannot silently degrade to scaffold-only behavior.

Changed:

- `.github/workflows/live-smoke.yml`:
  - added required root-script presence check for `test:smoke:live`;
  - switched to strict `pnpm run test:smoke:live` execution path.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:smoke:live`

Open Risks / Follow-ups:

- Live smoke success still depends on credential availability in CI runtime.

Tags: ci,governance,providers
Type: ops
Impact: low

## 2026-03-02 - Public provider alias lifecycle API closure + export contract test

Why:

- Close a remaining public API gap by allowing alias lifecycle policies through
  the public `registerModelAlias(...)` helper, not only internal registry APIs.
- Add explicit entrypoint contract coverage for `extract/providers/io/
visualization/types/errors` exports.

Changed:

- `packages/langextract/src/public/providers.ts`: added backward-compatible
  overloads for `registerModelAlias(...)` supporting either:
  - legacy `registerModelAlias(alias, target, registry?)`, or
  - lifecycle-aware `registerModelAlias(alias, target, lifecycle, registry?)`.
- `packages/langextract/tests/factory-routing.test.ts`: added lifecycle-policy
  registration test via the public API wrapper with warning + metadata checks.
- `packages/langextract/tests/public-init.test.ts`: added package entrypoint
  export contract test for all public domains and stable warning/error symbols.
- `docs/migration/parity-matrix.md`: promoted `Extract API`, `Providers API`,
  `Public types`, and `Public errors` to `Implemented (parity-tested)`.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`

Open Risks / Follow-ups:

- Live provider smoke remains credential-gated and can skip when secrets are
  absent.

Tags: api,providers,contracts,tests
Type: feature
Impact: medium

## 2026-03-02 - Alias lifecycle enforcement and parity closure

Why:

- Close the remaining alias lifecycle parity checkpoint by enforcing lifecycle
  stages during provider route resolution.
- Surface lifecycle diagnostics through extraction warnings and provider routing
  metadata for release governance and observability.

Changed:

- `packages/langextract/src/internal/providers/types.ts`: added alias lifecycle
  contract types and optional routing warnings on resolved models.
- `packages/langextract/src/internal/providers/registry.ts`: added lifecycle
  enforcement for aliases (`active`, `deprecated`, `sunset`, `removed`),
  sunset override env support (`LANGEXTRACT_ALLOW_SUNSET_ALIASES`), lifecycle
  warnings, and lifecycle-aware alias metadata snapshots.
- `packages/langextract/src/internal/providers/builtins.ts`: moved builtin alias
  definitions to structured alias configs and hardened deep cloning.
- `packages/langextract/src/public/types.ts` and
  `packages/langextract/src/public/extract.ts`: added
  `alias_lifecycle` warning code and warning emission from routing diagnostics.
- `packages/langextract/tests/providers.registry.test.ts`: added lifecycle
  enforcement tests (deprecated warning, sunset gating, removed blocking, and
  metadata snapshots).
- `packages/langextract/tests/extract.alias-lifecycle.test.ts`: added
  extraction warning-path coverage for lifecycle diagnostics.
- `packages/langextract/tests/providers.schema.test.ts`: added builtin metadata
  assertion for gateway default alias and deep-copy lifecycle mutation guard.
- `docs/migration/parity-matrix.md`: marked P-03 completed and alias area as
  lifecycle-gated.
- `docs/migration/contract-deltas.md`: updated D-008 acceptance text to include
  enforcement and routing metadata expectations.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:smoke:live`

Open Risks / Follow-ups:

- Live smoke remains credential-gated and may skip locally/CI when provider
  secrets are absent.
- Alias lifecycle transitions still require release-time date policy updates
  before moving aliases into `deprecated`/`sunset`/`removed`.

Tags: providers,routing,aliases,parity
Type: feature
Impact: medium

## 2026-03-02 - Parity matrix closure for schema + live smoke

Why:

- Finish remaining parity-matrix test targets by adding dedicated extract-schema
  behavior coverage and a real live-provider smoke suite entrypoint.
- Align migration docs/checklists with current implementation and CI/runtime
  verification commands.

Changed:

- `packages/langextract/tests/extract.schema.test.ts`: added schema-focused
  extraction parity suite (schema constraint wiring, explicit-model behavior,
  and fence strictness behavior with schema hooks).
- `packages/langextract/tests/live/provider-smoke.test.ts`: added nightly/manual
  live provider smoke tests with route-resolution diagnostics for gateway,
  google, and openai routes (auto-skips when live mode/credentials are absent).
- `packages/langextract/package.json`: added `test:smoke:live`.
- `package.json`: added workspace-level `test:smoke:live`.
- `docs/migration/parity-matrix.md`: marked IO/visualization parity as
  parity-tested and marked checkpoint P-05 completed.
- `docs/migration/contract-deltas.md`: extended release checklist with
  `test:smoke:live` verification.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage:strict`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:smoke:live`

Open Risks / Follow-ups:

- Nightly/manual live smoke success depends on configured provider credentials
  (`AI_GATEWAY_API_KEY` or `LANGEXTRACT_API_KEY`, `GEMINI_API_KEY`,
  `OPENAI_API_KEY`) in CI/local environments.

Tags: tests,providers,migration,parity,ci
Type: feature
Impact: medium

## 2026-03-02 - Migration docs + CI workflow split

Why:

- Reflect post-implementation parity status in migration docs.
- Split CI into deterministic PR checks and live-smoke scaffold runs.
- Record strict coverage gate command presence requirement.

Changed:

- `docs/migration/parity-matrix.md`: refreshed parity statuses/checkpoints and
  added a required release checklist (semver, changelog, parity matrix, and
  contract delta updates).
- `docs/migration/contract-deltas.md`: marked D-005 implemented, added D-011
  (`test:coverage:strict` presence requirement), and added matching release
  checklist items.
- `.github/workflows/pr-offline-deterministic.yml`: new blocking PR workflow
  for offline deterministic checks with explicit
  `test:coverage:strict` presence verification.
- `.github/workflows/live-smoke.yml`: new nightly/manual live smoke scaffold
  with PR execution set non-blocking (`continue-on-error` on PR events).

Validation:

- Docs + CI config update only; no local test commands executed.

Open Risks / Follow-ups:

- Strict coverage thresholds are now wired and enforced by command/workflow, but
  coverage percentages still need to be raised to meet release gates.

Tags: docs,ci,migration,parity
Type: ops
Impact: medium

## 2026-03-02 - Runtime migration implementation (AI SDK v6 baseline)

Why:

- Execute approved migration plan beyond docs by implementing AI SDK v6 runtime
  contracts in `@langextract-ts/langextract`.
- Establish registry-first provider resolution, default alias handling, and
  extraction precedence behavior under tests.

Changed:

- `packages/langextract/package.json`: moved package to AI SDK v6 dependency
  baseline and Node 20 runtime floor.
- `packages/langextract/src/index.ts`: exports now include public API domains
  `extract/providers/io/visualization/types/errors`.
- `packages/langextract/src/internal/providers/*`: registry-first routing,
  alias/fallback policy, and builtin provider presets.
- `packages/langextract/src/public/providers.ts`: public provider registry API
  for aliases, fallback routes, and plugin loading.
- `packages/langextract/src/internal/annotation/annotator.ts`: switched model
  calls to `generateText` with fallback attempts and redacted error reporting.
- `packages/langextract/src/public/extract.ts`: options-object extraction API
  with precedence (`model` > `config.model` > routed provider/model > default),
  prompt-description passthrough, and URL fetch toggle.
- `packages/langextract/tests/*.test.ts`: contract tests for extraction,
  providers, resolver, prompting, and tokenizer/chunking foundations.

Validation:

- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run check`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run verify`
- `pnpm -C /Users/tristan/Projects/langextract/langextract-ts run test:coverage`
- Python baseline in isolated env:
  - `pytest -q` in `/Users/tristan/Projects/langextract/langestract` after
    installing `[test]` and `openai>=1.50.0` extras.

Open Risks / Follow-ups:

- Coverage gate targets from the migration plan are not yet reached
  (`67.24%` overall in current TS coverage run).
- Full Python feature parity remains in progress for extraction options, IO
  edge-cases, visualization overlap semantics, and broader contract suites.

Tags: runtime,migration,ai-sdk-v6,providers,extract
Type: feature
Impact: high

## 2026-03-02 - Migration docs baseline uplift to AI SDK v6

Why:

- Move migration documentation from an AI SDK v5 baseline to AI SDK v6.
- Document registry-first routing and default model alias lifecycle policy.
- Keep parity tracking explicit with checkpoint IDs tied to approved deltas.

Changed:

- `docs/migration/contract-deltas.md`: replaced AI SDK v5 baseline language with
  AI SDK v6 baseline language; added D-007 (registry-first routing) and D-008
  (alias lifecycle policy for `google/gemini-3-flash`).
- `docs/migration/parity-matrix.md`: updated provider target to AI SDK v6 and
  added parity checkpoints P-01 through P-04.
- `packages/langextract/README.md`: updated provider wording to AI SDK v6 and
  added concise default public route policy notes.
- `docs/AI_CHANGE_LOG.md`: recorded this migration-docs-only uplift.

Validation:

- Documentation-only update; no runtime or test commands executed.

Open Risks / Follow-ups:

- Implementation artifacts may still require synchronization to the AI SDK v6
  baseline where code updates are pending.
- Alias lifecycle enforcement still needs contract test coverage as provider
  parity work progresses.

Tags: docs,migration,contracts,ai-sdk-v6
Type: ops
Impact: medium
