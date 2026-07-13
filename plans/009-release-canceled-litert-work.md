# Plan 009: Release active LiteRT work when a request is canceled

> **Executor instructions**: Follow every step and verification gate. This plan changes an async lifecycle boundary; instrument and test the ordering before choosing an implementation. Stop on any listed STOP condition rather than claiming cancellation that only hides a result. Update `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat daa5e52..HEAD -- utils/realEsrgan.ts entrypoints/litert-runner/main.ts utils/runnerLifecycle.ts utils/realEsrganCancellation.test.ts`
> If runner request, cleanup, or cancellation code changed, compare live code against this plan before proceeding. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/007-clean-up-failed-runner-creation.md`
- **Category**: perf
- **Planned at**: commit `daa5e52`, 2026-07-12 (reconciled after plans 007/008 landed)

## Why this matters

The parent rejects an aborted tile and sends `CANCEL_TILE`, but the runner can only skip work that has not started. An active `model.run` continues and holds the runner's serial queue, so closing one viewer can delay the next enhancement and keep GPU/CPU resources busy. Cancellation must either interrupt the active API call or invalidate the runner execution context; merely discarding the result is not sufficient.

## Current state

- `utils/realEsrgan.ts:224-249` sends cancellation but immediately rejects only the parent-side Promise:

```ts
const onAbort = (): void => {
  runner.pending.delete(id)
  runner.port.postMessage({ type: 'CANCEL_TILE', id })
  cleanup()
  reject(new DOMException('Image enhancement canceled', 'AbortError'))
}
```

- `entrypoints/litert-runner/main.ts:452-468` stores canceled IDs and skips only before queued work begins.
- `entrypoints/litert-runner/main.ts:347-389` awaits `state.model.run(inputTensor)`; the installed `@litertjs/core` `CompiledModel.run` type has no `AbortSignal` parameter.
- `entrypoints/litert-runner/main.ts:475-480` cleans canceled IDs on success but not consistently on error.
- `utils/realEsrgan.ts:473-490` already has a full runner disposal path, but it is called only on `pagehide` by `entrypoints/content.ts:1633-1635`.

Preserve the current local-only architecture, one-tile-at-a-time content pipeline, Lanczos fallback, and no new permissions. Reuse plan 007's centralized lifecycle cleanup rather than introducing a second disposal implementation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/realEsrganCancellation.test.ts` | all cancellation tests pass |
| Typecheck/unit | `pnpm check` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `utils/realEsrgan.ts`
- `entrypoints/litert-runner/main.ts`
- `utils/runnerLifecycle.ts` (only to reuse/extend plan 007 ownership cleanup)
- `utils/realEsrganCancellation.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Runner authentication, token claims, dynamic WAR, request-origin security, or any plan 002 replacement.
- Changing model files, tile dimensions, AI output, or fallback text.
- Adding workers, offscreen documents, remote services, or permissions.
- Keeping a canceled model cache alive at the cost of continued active inference.

## Git workflow

- Branch: `codex/009-cancel-litert-work`
- Commit: `fix: release canceled LiteRT inference`
- Commit body must state whether LiteRT supports native cancellation and which fallback lifecycle was chosen.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Confirm the runtime cancellation capability

Inspect the installed `@litertjs/core` types and implementation for a supported per-run cancellation/abort API. Record the result in the implementation handoff, not a speculative source comment.

- If a supported API exists, use it and add a focused adapter test.
- If it does not exist (the current `CompiledModel.run` signature suggests this), choose runner invalidation: remove/terminate the iframe and close its port so the browser tears down the active execution context; the next request creates a fresh runner.

Do not treat `CANCEL_TILE` plus result suppression as active cancellation.

**Verify**: a short handoff note names the inspected API/type location and selected path.

### Step 2: Centralize runner invalidation

Add an idempotent invalidation function in `utils/realEsrgan.ts`, reusing plan 007 lifecycle cleanup. It must:

- act only on the exact `RunnerClient` being canceled;
- clear `runnerPromise` only if it still refers to that runner;
- close the port and remove the iframe;
- reject and clean all pending requests once with `AbortError` (or the original timeout error for timeout invalidation);
- prevent late port messages from resolving stale requests;
- allow the next `getRunner` call to create a fresh iframe.

Avoid sending `DISPOSE` and waiting behind the active serial queue when the goal is preemption.

**Verify**: `pnpm compile` → exit 0.

### Step 3: Wire abort and timeout to real resource release

Update `runTile` so abort and tile timeout invalidate the active runner after cleaning the request listener/timer. Decide and document the ordering to avoid double rejection. If native cancellation is used instead, keep the same parent-side guarantees and reset the runner if native cancellation fails.

In the runner, ensure all success, error, skipped, and canceled paths remove request IDs from `canceled` in `finally`. Queued requests canceled before start must still be skipped cheaply.

**Verify**: source inspection plus focused tests show no canceled ID survives a terminal request path.

### Step 4: Add deterministic cancellation/retry tests

Use fake ports/iframes and deferred Promises to cover:

1. abort before a tile starts rejects without starting inference;
2. abort after start invalidates/removes the current runner;
3. every pending request is rejected exactly once;
4. late responses from the old port are ignored;
5. the next request creates a new runner and can succeed;
6. timeout invalidation preserves timeout error semantics;
7. repeated invalidation is idempotent.

Do not use a real model or wall-clock sleeps in unit tests.

**Verify**: `pnpm test -- utils/realEsrganCancellation.test.ts` → all pass twice with no unhandled rejections.

### Step 5: Verify the real browser retry path

Reload `.output/chrome-mv3` in Chrome, begin AI enhancement, cancel/close after `tile_inference_start`, immediately reopen, and confirm a subsequent request is not blocked by the old runner. Record event timestamps for cancellation, cleanup, new runner readiness, and the later request. Do not add production debug hooks solely for this check.

**Verify**: `pnpm check && pnpm build && pnpm build:firefox` → all automated gates exit 0; the manual Chrome event sequence confirms prompt retry.

## Test plan

- New fake-port/deferred-promise tests for the seven cases above.
- Existing outcome and cache tests remain green.
- Manual Chrome close-during-AI and immediate-retry verification is required.
- Manually verify close-during-AI followed by immediate reopen on Chrome before approval.

## Done criteria

- [ ] Canceling an active tile releases or terminates its actual execution context.
- [ ] New requests do not wait behind canceled active work.
- [ ] Pending Promises, timers, ports, iframe, and canceled IDs are cleaned exactly once.
- [ ] Retry creates a healthy new runner.
- [ ] Required unit, browser, Chrome, and Firefox gates pass.
- [ ] No plan 002 behavior or new permission was introduced.

## STOP conditions

- The only available approach continues `model.run` while merely hiding its result.
- Terminating the iframe does not stop active inference in a real Chrome check.
- Correct cancellation requires a new permission, remote process, or broad architecture migration.
- Runner invalidation breaks Lanczos fallback or prevents a later healthy retry after two reasonable attempts.

## Maintenance notes

Reviewers must distinguish queued cancellation from active cancellation and verify both. Any future parallel tile execution will change the invalidation blast radius and must revisit this design. The expected trade-off is a cold model reload after cancellation in exchange for promptly releasing obsolete work.
