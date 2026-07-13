# Plan 005: Prevent enhanced-image cache reuse across different sources

> **Executor instructions**: Follow the steps and add the regression test before relying on the fix. Update the index status when complete unless a reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat ec2ea3b..HEAD -- entrypoints/content.ts utils/upscaleCache.ts utils/upscaleCache.test.ts`
> If cache key construction, source activation, or cleanup changed, stop and reconcile this plan with live code.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: bug
- **Planned at**: commit `ec2ea3b`, 2026-07-11

## Why this matters

The overlay can move from the initially displayed URL to an upgraded or fallback candidate. Its enhancement cache is shared for the overlay lifetime, but keys identify only algorithm/model and dimensions. If two different sources yield the same target dimensions, the second source can display the first source's cached pixels. The cache must be scoped to the active source generation and old object URLs must be revoked when a source is abandoned.

## Current state

```ts
// entrypoints/content.ts:992-1000
return {
  key: `${activeEnhancementMode}:${
    activeEnhancementMode === 'ai' ? activeAiEnhancementModel : 'na'
  }:${width}x${height}`,
  width,
  height,
}
```

```ts
// entrypoints/content.ts:1031-1040
const cached = upscaleCache.get(target.key)
if (cached) {
  showUpscaledSource(cached, target.key)
  return
}
```

```ts
// entrypoints/content.ts:1193-1204
const activateSource = (index: number): void => {
  if (sourceGeneration > 0) cancelUpscale()
  activeSourceIndex = index
  src = sourceUrls[index]
  sourceGeneration += 1
}
```

- Cache URLs are currently revoked only during overlay cleanup at `content.ts:1369-1379`.
- Preserve the existing in-flight request ID checks; this plan fixes cache identity, not general cancellation.
- Avoid placing a full data URL in a cache key. `sourceGeneration` is already a compact per-overlay identity.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/upscaleCache.test.ts` | cache identity tests pass |
| Typecheck | `pnpm compile` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `entrypoints/content.ts`
- `utils/upscaleCache.ts` (create only for a small pure key helper)
- `utils/upscaleCache.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Changing source candidate order or `srcset` parsing.
- Cross-overlay/global caching.
- Changing AI/Lanczos output dimensions or activation timing.
- Refactoring the entire overlay controller.

## Git workflow

- Branch: `codex/005-scope-upscale-cache`
- Suggested commit: `fix: scope enhancement cache to source image`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a regression-testable cache identity

Create a small pure key builder if needed. Its inputs must include:

- `sourceGeneration`;
- enhancement mode;
- AI model only when mode is AI;
- target width and height.

The same source generation and parameters must produce the same key. Different generations must produce different keys even when URL dimensions and algorithm are identical. Do not include raw data/blob URL contents.

**Verify**: `pnpm test -- utils/upscaleCache.test.ts` → same-source cache-hit and different-source cache-miss cases pass.

### Step 2: Use the source-scoped key everywhere

Update `getUpscaleTarget`, in-flight key, rendered key, lookup, insertion, and logging to use the same source-scoped key. Capture generation in a local request value so a source change cannot cause the old request to insert under the new generation.

Keep the existing `requestId`/`overlayClosed` checks as a second guard.

**Verify**: `pnpm compile` → exit 0.

### Step 3: Revoke abandoned source cache entries

Add one focused cache-clear helper inside `openOverlay` that revokes every object URL before clearing the map. Call it:

- when switching away from an already-active source;
- during overlay cleanup.

Do not revoke the URL currently displayed until `restoreOriginalSource` has switched `img.src` away from it. Make ordering explicit: cancel/restore, then revoke/clear, then activate the next source.

**Verify**: a narrow test or spy confirms each cached URL is revoked once and the new source has an empty cache.

### Step 4: Browser smoke fallback and upgrade paths

Use two candidate URLs with equal natural dimensions but visibly different content. Force the first to cache an enhancement, then activate/fall back to the second. Confirm no first-source pixels appear and closing the viewer revokes remaining URLs without console errors.

**Verify**: `pnpm compile && pnpm test && pnpm build` → exit 0.

## Test plan

- Key stability for identical inputs.
- Different `sourceGeneration` causes a miss despite identical dimensions/model.
- Different model/mode/dimensions cause misses as before.
- Cache clearing revokes every stored object URL exactly once.
- Manual equal-dimension source switch regression.

## Done criteria

- [ ] Cache keys contain compact source identity.
- [ ] An old request cannot insert or display under a new source generation.
- [ ] Switching source restores original display before revoking cached URLs.
- [ ] Old source URLs are revoked and cache cleared.
- [ ] Overlay cleanup remains idempotent.
- [ ] `pnpm compile`, `pnpm test`, and `pnpm build` exit 0.
- [ ] Only in-scope files changed and plan status updated.

## STOP conditions

Stop and report if:

- Source switching can occur without incrementing `sourceGeneration`.
- Revocation ordering causes the currently displayed image to disappear before replacement.
- Fixing the issue requires changing candidate selection semantics.
- Tests require importing and executing the entire WXT content entrypoint; extract only the pure cache-key behavior instead of building a broad mock.

## Maintenance notes

Any future global or cross-overlay cache must use a stable content identity stronger than dimensions—prefer a validated source identifier or content hash. `sourceGeneration` is intentionally local to one overlay and must not be reused as a global identity.

