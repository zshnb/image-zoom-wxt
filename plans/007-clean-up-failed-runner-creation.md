# Plan 007: Clean up every failed LiteRT runner creation

> **Executor instructions**: Follow every step and verification gate. Stop on any listed STOP condition rather than broadening the runner architecture. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat cf22a12..HEAD -- utils/realEsrgan.ts utils/runnerLifecycle.ts utils/runnerLifecycle.test.ts`
> If runner creation or disposal changed, compare the excerpts below with live code. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: bug
- **Planned at**: commit `cf22a12`, 2026-07-12

## Why this matters

`createRunner` appends a hidden extension iframe before awaiting its load. A load error or ten-second timeout rejects before the existing handshake cleanup block, leaving the iframe behind. Because `runnerPromise` resets after failure, every retry can append another hidden runner and retain DOM/runtime resources until the page is destroyed.

## Current state

- `utils/realEsrgan.ts:95-117` creates and appends the iframe inside a load Promise:

```ts
const iframe = document.createElement('iframe')
// attributes omitted
await new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error('LiteRT runner load timed out')), 10_000)
  iframe.addEventListener('load', () => {
    window.clearTimeout(timeout)
    resolve()
  }, { once: true })
  iframe.addEventListener('error', () => {
    window.clearTimeout(timeout)
    reject(new Error('LiteRT runner failed to load'))
  }, { once: true })
  document.documentElement.appendChild(iframe)
})
```

- `utils/realEsrgan.ts:177-185` removes the iframe only if the later MessageChannel handshake fails.
- `utils/realEsrgan.ts:193-199` clears `runnerPromise` after creation failure, enabling retries.
- `utils/realEsrgan.ts:451-471` owns the successful runner's disposal path; preserve its observable behavior.

Follow the existing explicit cleanup style in `entrypoints/content.ts` overlay cleanup and `utils/upscaleCache.ts`: ownership must be clear, cleanup idempotent, and object/port disposal centralized.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/runnerLifecycle.test.ts` | all lifecycle tests pass |
| Typecheck/unit | `pnpm check` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `utils/realEsrgan.ts`
- `utils/runnerLifecycle.ts` (create only if a small test seam is needed)
- `utils/runnerLifecycle.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Runner authentication, tokens, dynamic WAR URLs, or other plan 002 work.
- Changing model loading, tile math, inference, fallback, or timeout durations.
- Keeping the runner alive longer or adding a new extension permission.
- Refactoring unrelated `realEsrgan.ts` code.

## Git workflow

- Branch: `codex/007-runner-failure-cleanup`
- Commit: `fix: clean up failed LiteRT runners`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define one ownership boundary for runner creation

Restructure `createRunner` so iframe creation, load listeners, load timeout, MessageChannel, and READY timeout are owned by one `try`/cleanup boundary. Track whether ownership was successfully transferred into the returned `RunnerClient`. On every unsuccessful exit:

- clear both timers;
- remove load/error listeners if still registered;
- close any created `MessagePort`;
- reject and clean pending requests if the map exists;
- remove the iframe exactly once.

Do not remove the iframe after a successful return. Do not change the connect message or target origin.

**Verify**: `pnpm compile` → exit 0.

### Step 2: Extract only the minimal test seam

If direct testing of private DOM lifecycle logic is impractical, extract a small `waitForRunnerFrame`/cleanup helper into `utils/runnerLifecycle.ts`. It may depend on `EventTarget`, timer callbacks, and a removable resource interface, but must not become a general lifecycle framework. Node's `EventTarget` and Vitest fake timers should be sufficient; do not add jsdom/happy-dom solely for this plan.

**Verify**: `pnpm test -- utils/runnerLifecycle.test.ts` → exit 0.

### Step 3: Add failure-path regression tests

Cover at least:

1. load success clears the load timeout and listeners;
2. iframe `error` rejects and cleanup removes the resource once;
3. load timeout rejects and cleanup removes the resource once;
4. READY handshake timeout closes the port and removes the iframe;
5. a failure followed by retry does not retain the first iframe;
6. successful ownership transfer does not remove the live iframe.

Use fake timers and explicit event dispatch. Assertions must count removals/port closes, not merely check rejection text.

**Verify**: focused tests pass twice with no unhandled rejection warning.

### Step 4: Run browser and build gates

Run a manual Chrome smoke after the cleanup refactor. Reload `.output/chrome-mv3`, refresh a normal HTTPS image page, Shift-click an image, zoom upward to trigger enhancement, close the viewer, reopen it, and confirm the second attempt can reuse or recreate one healthy runner. Document that timeout/error cleanup is unit-covered; do not add production debug controls solely for this check.

**Verify**: `pnpm check && pnpm build && pnpm build:firefox` → all exit 0; manual Chrome checklist completes without duplicate hidden runner behavior.

## Test plan

- New focused lifecycle tests listed above.
- Existing 69+ unit tests remain green.
- Manual Chrome smoke proves normal viewer/retry behavior still works.
- Manually inspect the failed-retry test to confirm resource counts return to baseline.

## Done criteria

- [ ] Every unsuccessful `createRunner` exit removes the iframe and closes created ports.
- [ ] Load/error listeners and timers are cleared on success and failure.
- [ ] Retry after failure starts from zero retained failed iframes.
- [ ] Normal runner reuse/disposal behavior is unchanged.
- [ ] All focused, unit, browser, Chrome, and Firefox gates pass.
- [ ] Only in-scope files changed.

## STOP conditions

- Cleanup requires changing the runner handshake protocol or WAR configuration.
- A test needs production-only debug messages or broader extension permissions.
- Removing a failed iframe causes a late callback to mutate a new runner instance; stop and report the observed ordering.
- A verification gate fails twice after a reasonable fix.

## Maintenance notes

Any future resource added to `RunnerClient` must be registered with this ownership boundary and released by both failure cleanup and `disposeRealEsrgan`. Reviewers should specifically inspect timeout/listener cleanup and successful ownership transfer.
