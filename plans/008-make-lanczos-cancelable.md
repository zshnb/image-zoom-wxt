# Plan 008: Stop Lanczos work when enhancement is canceled

> **Executor instructions**: Follow every step and verification gate. Stop on any listed STOP condition instead of changing the rendering algorithm or moving it to a worker. Update the `plans/README.md` row when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat cf22a12..HEAD -- entrypoints/content.ts utils/lanczos.ts utils/lanczos.test.ts`
> If Lanczos functions or `applyUpscale` changed, compare live code against the excerpts below. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: perf
- **Planned at**: commit `cf22a12`, 2026-07-12

## Why this matters

The viewer already creates an `AbortController` when enhancement starts and aborts it when the viewer closes, the source changes, or a newer request supersedes it. AI work observes that signal, but the two-pass Lanczos resize does not. A canceled resize can therefore continue processing millions of pixels on the page's main thread even though its result will be discarded.

## Current state

- `entrypoints/content.ts:406-471` implements `resizeLanczos3` with horizontal and vertical full-image loops. It yields periodically but never checks cancellation:

```ts
if (performance.now() - lastYield >= RESIZE_YIELD_MS) {
  await waitForNextFrame()
  lastYield = performance.now()
}
```

- `entrypoints/content.ts:474-519` implements `createLanczosObjectUrl` without an `AbortSignal` parameter.
- `entrypoints/content.ts:937-951` aborts `upscaleAbortController` in `cancelUpscale`.
- `entrypoints/content.ts:1116-1124` calls Lanczos without passing `abortController.signal`.
- `utils/realEsrgan.ts:87-93` provides the established cancellation convention: throw a `DOMException` named `AbortError`; `entrypoints/content.ts:1130-1138` already treats that error as cancellation rather than failure.

Match current image-processing conventions: typed arrays, periodic browser-frame yielding, explicit canvas zeroing/object URL revocation, and no remote or worker dependency.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/lanczos.test.ts` | all Lanczos tests pass |
| Typecheck/unit | `pnpm check` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `entrypoints/content.ts`
- `utils/lanczos.ts` (create)
- `utils/lanczos.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Web Workers, OffscreenCanvas, GPU compute, or changing Lanczos radius/output.
- LiteRT cancellation; that is plan 009.
- UI text, cache keys, enhancement outcome policy, or size caps.
- Broad decomposition of `content.ts` beyond the Lanczos functions needed for testing.

## Git workflow

- Branch: `codex/008-cancel-lanczos`
- Commit: `fix: cancel superseded Lanczos work`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Extract the pure resize engine with a cancellation contract

Move only the Lanczos math needed by `resizeLanczos3` into `utils/lanczos.ts`: weight creation, sinc/kernel helpers, and the two-pass resize. Export a typed resize function that accepts an `AbortSignal` and a small injectable yield callback for deterministic tests. Keep the production default equivalent to the current animation-frame yield.

Add one shared `throwIfAborted` helper local to the module. Check the signal:

- before allocating large intermediate arrays;
- periodically while generating horizontal and vertical weights;
- once per processed row in both passes;
- immediately before and after each awaited yield;
- before returning the final output.

Do not check every pixel; per-row/periodic checks are sufficient and avoid material overhead.

**Verify**: `pnpm compile` → exit 0 and output types remain `Uint8ClampedArray<ArrayBuffer>`.

### Step 2: Thread the existing request signal through canvas encoding

Update `createLanczosObjectUrl` to accept `AbortSignal` and pass it to the extracted resize function. Check cancellation before canvas reads, after resize, before `toBlob`, and after blob encoding. If an object URL was created after cancellation, revoke it before throwing `AbortError`.

At `applyUpscale`, pass `abortController.signal` into Lanczos. Preserve existing `requestCanceled`, stale generation, status, and fallback behavior.

**Verify**: `rg -n "createLanczosObjectUrl" entrypoints/content.ts` → every call supplies a signal.

### Step 3: Add deterministic cancellation tests

Model tests after existing `utils/upscaleCache.test.ts` and use Vitest mocks rather than real time. Cover:

1. a small resize produces the same dimensions and stable representative pixels;
2. a pre-aborted signal throws `AbortError` before large allocation/work;
3. abort from the injected yield callback stops during the horizontal pass;
4. abort during the vertical pass stops before completion;
5. canceled work does not call later yield/output hooks;
6. non-canceled work still yields and completes.

Avoid fragile full-image snapshots. Assert named pixels/dimensions and cancellation stage counters.

**Verify**: `pnpm test -- utils/lanczos.test.ts` → all new tests pass twice.

### Step 4: Verify real viewer cancellation

Reload `.output/chrome-mv3` in Chrome and manually verify: select quick clarity, start a large resize, close immediately, and confirm no late result/status appears and the page becomes responsive promptly. Reopen the viewer and confirm a later resize still completes. Do not add production debug hooks for this check.

**Verify**: `pnpm check && pnpm build && pnpm build:firefox` → all automated gates exit 0; record the manual Chrome checklist separately.

## Test plan

- New `utils/lanczos.test.ts` cases listed above.
- Existing outcome/cache tests must remain unchanged and green.
- Manual Chrome smoke verifies shortcut/viewer and cancellation flow remain intact.
- No test may depend on real GPU, network, or wall-clock race timing.

## Done criteria

- [ ] Every Lanczos request receives the current enhancement `AbortSignal`.
- [ ] Pre-start and mid-resize cancellation throw `AbortError` promptly.
- [ ] Canceled post-encode URLs are revoked.
- [ ] Successful Lanczos pixels/dimensions remain equivalent to the current algorithm.
- [ ] Focused, unit, browser, Chrome, and Firefox gates pass.
- [ ] Only in-scope files changed.

## STOP conditions

- Preserving output requires changing Lanczos radius, scale calculation, or blending semantics.
- Cancellation cannot be tested without real-time sleeps or production debug hooks.
- The extraction grows beyond the Lanczos pipeline into viewer orchestration.
- A verification gate fails twice after a reasonable fix.

## Maintenance notes

Future Lanczos stages must accept the same signal and check it around large allocation, row loops, and awaits. Reviewers should scrutinize object URL cleanup and verify that cancellation is not reported as an enhancement failure.
