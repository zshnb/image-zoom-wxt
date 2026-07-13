# Plan 010: Reject oversized WASM jobs before the first tile inference

> **Executor instructions**: Follow every step and verification gate. Keep the model table pure and shared; do not guess a backend in the content script. Stop on any listed STOP condition. Update `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 23fa285..HEAD -- utils/realEsrgan.ts entrypoints/litert-runner/main.ts utils/realEsrganModels.ts utils/realEsrganModels.test.ts`
> If model configuration, request shape, or backend fallback changed, compare live code with the excerpts below. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/009-release-canceled-litert-work.md`
- **Category**: perf
- **Planned at**: commit `23fa285`, 2026-07-12 (reconciled after plan 009 landed)

## Why this matters

The content side knows the total tile count, but the runner is the first component that knows the selected backend. Today a job that exceeds the nine-tile WASM budget still loads the runtime/model and completes one tile before being rejected. On machines without usable WebGPU, this creates the longest wait on the slowest backend even though the outcome is predetermined fallback to Lanczos.

## Current state

- `utils/realEsrgan.ts:32-58` owns content-side model metadata, including `padding`, `maxTiles`, `maxWasmTiles`, and `dtype`.
- `entrypoints/litert-runner/main.ts:18-62` separately owns runner-side model URL, dimensions, dtype, JSPI, and WASM capability. These two tables can drift.
- `utils/realEsrgan.ts:303-307` computes `tileCount` and applies only the general `maxTiles` limit.
- `utils/realEsrgan.ts:375-391` performs the WASM limit check after `await runTile(...)` has returned the first result:

```ts
const result = await runTile(/* ... */)
backend = result.backend
if (backend === 'wasm' && tileCount > config.maxWasmTiles) {
  throw new Error(/* ... */)
}
```

- `entrypoints/litert-runner/main.ts:246-276` calls `getModel` before `runWithModel`, so it can enforce the backend-specific budget after backend selection and before inference.
- `entrypoints/litert-runner/main.ts:393-415` may retry a failed WebGPU tile on WASM; the budget must be checked again before that WASM retry.

The shared module must contain data and pure guards only. It must not import browser APIs, LiteRT, React, or DOM types, so it remains safe in both bundles and unit tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/realEsrganModels.test.ts` | all table/budget tests pass |
| Typecheck/unit | `pnpm check` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `utils/realEsrgan.ts`
- `entrypoints/litert-runner/main.ts`
- `utils/realEsrganModels.ts` (create)
- `utils/realEsrganModels.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Runner authentication, message-origin policy, dynamic WAR, or other plan 002 work.
- Changing model binaries, tile size/padding, numerical output, or the existing limits.
- Predicting WebGPU support in the content script.
- Downloading models remotely or adding permissions.
- Changing fallback outcome text from plan 004.

## Git workflow

- Branch: `codex/010-wasm-tile-preflight`
- Commit: `perf: preflight WASM tile budgets`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Create one pure model metadata source

Create `utils/realEsrganModels.ts` with a readonly table keyed by `AiEnhancementModel`. Consolidate the values currently duplicated across content and runner:

- model resource path;
- input/output sizes;
- padding/content size;
- dtype;
- global tile limit;
- WASM tile limit;
- JSPI requirement;
- whether WASM is allowed.

Export narrow types/helpers so both callers derive their existing config shapes without mutation. Keep the current values exactly; this step is consolidation, not tuning.

**Verify**: a source search shows only the shared table owns literal model dimensions, dtype, and tile limits.

### Step 2: Carry total tile count to the runner explicitly

Extend the internal `RUN_TILE` request type with a positive integer `tileCount` field. Populate it from the already computed total in `createRealEsrganObjectUrl`. Do not infer it from arbitrary log metadata. Preserve `tileIndex`, row, and column diagnostics.

This is a local protocol addition only. Do not introduce authentication, tokens, or dynamic resource URLs.

**Verify**: `pnpm compile` → exit 0 and every `RUN_TILE` construction supplies `tileCount`.

### Step 3: Enforce the budget after backend selection and before inference

Add a pure helper such as `assertTileBudget(model, backend, tileCount)` in the shared module. In runner `runTile`:

1. call `getModel`;
2. check the selected backend and total count;
3. only then call `runWithModel`.

If a WebGPU inference fails and the runner rebuilds on WASM, run the same check immediately after obtaining the WASM state and before its `runWithModel`. For `x4plus`, whose WASM limit is zero/unsupported, reject before WASM inference. Return the error through the existing `RUN_TILE_ERROR` path so content falls back to Lanczos and plan 004 reports that outcome.

Remove the late content-side WASM check only after runner preflight tests prove both native-WASM and WebGPU-to-WASM paths. Retain the global `maxTiles` check before runner creation.

**Verify**: focused tests plus source inspection show `runWithModel` cannot be reached with an over-budget WASM job.

### Step 4: Add table and preflight regression tests

Cover at least:

1. both models expose the current exact sizes, padding, dtype, and limits;
2. general-x4v3 accepts WASM counts through 9 and rejects 10+;
3. x4plus rejects all WASM tile inference if its limit remains zero;
4. WebGPU accepts counts through the existing global max;
5. invalid/non-positive/non-integer counts are rejected by the pure helper;
6. WebGPU-to-WASM fallback rechecks the WASM budget before the WASM run callback;
7. over-budget errors remain bounded and do not include model bytes or source URLs.

For case 6, extract/inject only the minimal backend-run decision seam needed for a unit test; do not mock the entire LiteRT runtime.

**Verify**: `pnpm test -- utils/realEsrganModels.test.ts` → all tests pass twice.

### Step 5: Verify latency-path behavior

Reload `.output/chrome-mv3` in a Chrome environment using WASM, process an image above nine tiles, and confirm fallback occurs without a WASM `tile_inference_start` event. Record the model, tile count, selected backend, fallback event, and timestamps in the handoff. Do not add a production backend override solely for this check.

**Verify**: `pnpm check && pnpm build && pnpm build:firefox` → automated gates exit 0; manual log shows no WASM tile inference for an over-budget job.

## Test plan

- New shared-table/budget tests listed above.
- Existing enhancement outcome tests confirm fallback messaging remains correct.
- Manual Chrome diagnostic validates the no-first-WASM-tile event ordering.

## Done criteria

- [ ] Model metadata has one pure source of truth used by content and runner.
- [ ] Total tile count is explicit in every `RUN_TILE` request.
- [ ] Over-budget WASM jobs fail before `runWithModel`, including fallback-to-WASM.
- [ ] WebGPU jobs and global max-tile behavior remain unchanged.
- [ ] Lanczos fallback and plan 004 outcome reporting still work.
- [ ] Focused, unit, browser, Chrome, and Firefox gates pass.
- [ ] No plan 002 behavior or permission change was introduced.

## STOP conditions

- Backend cannot be known before the first inference without changing LiteRT or running a probe inference.
- Sharing metadata introduces browser/LiteRT side effects into the content bundle.
- Correct enforcement requires changing the existing numerical limits or model files.
- The runner rejects jobs that a verified WebGPU path could process.
- A verification gate fails twice after a reasonable fix.

## Maintenance notes

Any new model or backend must update the shared table and table-driven tests. Reviewers should verify both initial backend selection and WebGPU fallback apply the same budget before inference; a check after the result is too late.
