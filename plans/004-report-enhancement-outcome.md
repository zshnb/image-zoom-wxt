# Plan 004: Tell users whether AI enhancement succeeded or fell back

> **Executor instructions**: Follow the plan exactly, including both locales and stale-request guards. Update this plan's index row when done unless a reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat ec2ea3b..HEAD -- entrypoints/content.ts public/_locales/en/messages.json public/_locales/zh_CN/messages.json utils/enhancementOutcome.ts utils/enhancementOutcome.test.ts`
> If enhancement control flow or locale keys changed, compare live code with this plan and stop on a semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: bug
- **Planned at**: commit `ec2ea3b`, 2026-07-11

## Why this matters

Selecting “AI clarity” does not guarantee AI runs. Unsupported WebGPU/JSPI, model compilation, inference, or tile limits cause a silent Lanczos fallback; the generic spinner simply disappears and the result is presented as though AI succeeded. The viewer must remain resilient, but it should accurately disclose the algorithm that produced the displayed result.

## Current state

```ts
// entrypoints/content.ts:1067-1084
if (requestMode === 'ai') {
  try {
    objectUrl = await createRealEsrganObjectUrl(...)
  } catch (error) {
    if (isEnhancementAbort(error)) throw error
    logImageEnhancement('warn', 'algorithm_fallback', requestContext, {
      from: requestAiModel,
      to: 'lanczos3',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}
```

```ts
// entrypoints/content.ts:1087-1101
if (!objectUrl) {
  objectUrl = await createLanczosObjectUrl(...)
}
```

- `showStatus` at `content.ts:727-735` already provides localized, non-blocking status UI for copy results.
- Existing visible strings are always updated in both `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`.
- The viewer must keep fallback automatic and must not expose internal error text, hostnames, model paths, or stack traces to users.

## User-visible behavior

- AI result applied: briefly show “AI clarity ready” / “智能高清已完成”.
- AI requested but Lanczos applied: briefly show “AI unavailable — showing quick clarity” / “智能高清不可用，已使用快速清晰”.
- Lanczos mode result applied: optionally show the existing-mode equivalent only if it is not noisy; at minimum, fallback must be explicit.
- Abort, close, source change, or stale request: show nothing.
- Both AI and fallback fail: retain original image and show a short localized failure message, without internal details.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/enhancementOutcome.test.ts` | all outcome mappings pass |
| Typecheck | `pnpm compile` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `entrypoints/content.ts`
- `public/_locales/en/messages.json`
- `public/_locales/zh_CN/messages.json`
- `utils/enhancementOutcome.ts` and `.test.ts` only if a small pure outcome mapper is needed for deterministic tests
- `plans/README.md` (status only)

**Out of scope**:

- Changing when AI starts, model selection, tile limits, or fallback algorithm.
- Showing raw exception messages to users.
- Popup redesign or persistent diagnostics/history.
- Adding notifications or permissions.

## Git workflow

- Branch: `codex/004-report-enhancement-outcome`
- Suggested commit: `fix: report image enhancement fallback`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Model the applied algorithm explicitly

Inside `applyUpscale`, track the requested mode separately from the applied result, for example `appliedAlgorithm: 'ai' | 'lanczos' | null` and `aiFallback: boolean`. Set it only after a non-null object URL exists. Do not infer success from the selected setting after the fact.

If extracting a helper, keep it pure and limited to mapping requested/applied/failure state to a locale message key. Do not move the enhancement pipeline into a new abstraction.

**Verify**: focused tests cover AI success, AI→Lanczos fallback, explicit Lanczos, total failure, and abort/no-message.

### Step 2: Add bilingual status messages

Add matching keys and descriptions to both locale files. Use concise user vocabulary already present in the popup: “AI clarity”, “quick clarity”, “智能高清”, and “快速清晰”. Do not mention LiteRT, WebGPU, JSPI, Wasm, exception text, or model filenames.

**Verify**: parse both JSON files and confirm the new key sets are identical.

### Step 3: Show only the outcome belonging to the displayed request

After the existing stale checks (`overlayClosed` and `requestId !== upscaleRequestId`) and after the object URL is applied, call `showStatus` with the correct outcome. A fallback status must not appear for an aborted or superseded request. Total failure may show a short failure status while preserving the original image.

**Verify**: tests or a narrow fake pipeline confirm stale/aborted requests produce no status.

### Step 4: Browser smoke the four outcomes

Verify AI success on a supported machine if available; force or simulate model failure; select explicit Lanczos; and close during processing. Confirm the correct short message, no raw errors, and no delayed stale status after closing/reopening.

**Verify**: `pnpm compile && pnpm test && pnpm build` → exit 0.

## Test plan

- Pure outcome mapping test with all requested/applied combinations.
- Locale parity test or deterministic JSON-key assertion.
- Manual overlay smoke for status timing, close/reopen, and fallback.
- Preserve existing logging for detailed diagnostics; tests should not require exact log message text.

## Done criteria

- [ ] Users can distinguish AI success, AI fallback, and complete failure.
- [ ] No stale or aborted request displays a status.
- [ ] Both locales contain equivalent keys.
- [ ] The original viewer remains usable on every enhancement failure.
- [ ] No raw error details are shown.
- [ ] `pnpm compile`, `pnpm test`, and `pnpm build` exit 0.
- [ ] Only in-scope files changed and plan status updated.

## STOP conditions

Stop and report if:

- The requested and applied algorithm cannot be distinguished without changing the runner protocol.
- UI status requires exposing raw internal errors.
- The implementation causes fallback to stop working or changes AI activation timing.
- Locale parity or stale-request tests cannot be made deterministic without broad `content.ts` refactoring.

## Maintenance notes

Future algorithms must report the applied algorithm independently of the selected preference. Keep user-facing statuses stable and brief; detailed failure causes belong only in the existing structured diagnostic logs.

