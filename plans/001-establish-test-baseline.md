# Plan 001: Establish a repeatable test and CI baseline

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat ec2ea3b..HEAD -- package.json pnpm-lock.yaml vitest.config.ts utils/storage.test.ts .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts with live code before proceeding. A mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `ec2ea3b`, 2026-07-11

## Why this matters

The extension's only automated verification is TypeScript compilation. That cannot detect behavioral regressions in settings migration, message validation, source selection, enhancement cancellation, or browser lifecycle handling. This plan adds the smallest useful WXT-native test baseline and CI gate; later plans add their own regression tests to this baseline rather than inventing separate harnesses.

## Current state

- `package.json` owns all development commands. It currently has no `test`, `check`, or lint command:

```json
// package.json:7-15
"scripts": {
  "dev": "wxt",
  "dev:firefox": "wxt -b firefox",
  "build": "wxt build",
  "build:firefox": "wxt build -b firefox",
  "zip": "wxt zip",
  "zip:firefox": "wxt zip -b firefox",
  "compile": "tsc --noEmit",
  "postinstall": "wxt prepare"
}
```

- `utils/storage.ts` contains existing pure validation and migration behavior suitable for the first characterization tests:

```ts
// utils/storage.ts:64-85
export function isImageEnhancementMode(value: unknown): value is ImageEnhancementMode
export function resolveImageEnhancementMode(mode: unknown, legacyEnabled: unknown): ImageEnhancementMode
export function isAiEnhancementModel(value: unknown): value is AiEnhancementModel
export function resolveAiEnhancementModel(value: unknown): AiEnhancementModel
export function isTriggerShortcutCode(value: unknown): value is TriggerShortcutCode
```

- There is no `.github/workflows/`, Vitest configuration, or test file.
- The official WXT testing pattern is `WxtVitest()` from `wxt/testing/vitest-plugin`. Use that integration so `@/` aliases and the fake extension APIs match WXT; do not build a custom browser mock.
- Repository style is TypeScript ESM, no semicolons, `pnpm`, and focused files. Do not add a general test utility layer for one test file.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install test dependency | `pnpm add -D vitest` | exit 0; only `package.json` and `pnpm-lock.yaml` dependency data change |
| Typecheck | `pnpm compile` | exit 0, no TypeScript errors |
| Tests | `pnpm test` | exit 0; all new tests pass |
| Unified check | `pnpm check` | exit 0; compile and tests both run |
| Chrome build | `pnpm build` | exit 0; `.output/chrome-mv3` remains present |

## Suggested executor toolkit

- Follow the WXT unit-testing documentation: <https://wxt.dev/guide/essentials/unit-testing>.
- Use `wxt/testing/fake-browser` only when a test needs storage state; reset it between tests.

## Scope

**In scope** (the only files to modify or create):

- `package.json`
- `pnpm-lock.yaml`
- `vitest.config.ts` (create)
- `utils/storage.test.ts` (create)
- `.github/workflows/ci.yml` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Production logic in `entrypoints/` or `utils/storage.ts`.
- Browser E2E or Playwright infrastructure; this first baseline is deterministic unit testing.
- Lint/formatter adoption; it is a separate toolchain decision.
- Dependency upgrades unrelated to installing Vitest.

## Git workflow

- Branch: `codex/001-test-baseline`
- Use conventional commits matching the repository, for example `test: add WXT unit test baseline`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the WXT-native Vitest harness

Install Vitest as a dev dependency. Create `vitest.config.ts` using `defineConfig` from `vitest/config` and `WxtVitest()` from `wxt/testing/vitest-plugin`. Keep the default Node environment because the first tests do not require DOM emulation.

Add scripts:

```json
"test": "vitest run",
"check": "pnpm compile && pnpm test"
```

Do not replace or rename `compile`.

**Verify**: `pnpm exec vitest run --passWithNoTests` → exit 0 and Vitest starts through the WXT plugin.

### Step 2: Characterize persistent-setting validation and migration

Create `utils/storage.test.ts`. Cover at least:

1. every value in `triggerShortcuts` is accepted and unrelated strings/objects are rejected;
2. `resolveImageEnhancementMode` returns a valid stored mode unchanged;
3. legacy `false` maps to `off`, while missing/invalid legacy state maps to `ai`;
4. valid AI model values survive and invalid values fall back to `DEFAULT_AI_ENHANCEMENT_MODEL`;
5. one storage item round-trip using WXT's fake browser, with state reset between tests.

Use table-driven cases where that is clearer. Assert behavior, not implementation details.

**Verify**: `pnpm test -- utils/storage.test.ts` → all cases pass with no unhandled warnings.

### Step 3: Add a minimal CI gate

Create `.github/workflows/ci.yml` for pushes and pull requests. Use one current LTS Node version, Corepack, a frozen pnpm install, `pnpm check`, and `pnpm build`. Cache pnpm using the standard `actions/setup-node` cache support. Do not add deployment, release, artifact upload, or secrets.

**Verify**: `pnpm check && pnpm build` → exit 0 locally.

### Step 4: Confirm scope and reproducibility

Run the complete verification sequence from a clean dependency state only if practical; do not delete `.output` after building because project rules require retaining build output.

**Verify**: `git diff --name-only` → contains only the in-scope files plus `plans/README.md` if its status was updated.

## Test plan

- New file: `utils/storage.test.ts`.
- Minimum coverage: valid and invalid shortcut codes; all three enhancement modes; legacy setting migration; both AI models and invalid fallback; fake-browser storage round-trip.
- Do not mock `utils/storage.ts`; exercise its real exported behavior.
- Verification: `pnpm test` → all tests pass.

## Done criteria

- [ ] `pnpm compile` exits 0.
- [ ] `pnpm test` exits 0 and runs `utils/storage.test.ts`.
- [ ] `pnpm check` runs compile followed by tests and exits 0.
- [ ] `pnpm build` exits 0.
- [ ] CI runs frozen install, check, and Chrome build.
- [ ] No production source file was modified.
- [ ] Only in-scope files are changed.
- [ ] Plan 001 status is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- WXT's Vitest plugin cannot load with the currently pinned WXT version.
- Adding Vitest requires upgrading WXT, TypeScript, React, or another existing dependency.
- The fake-browser storage implementation behaves differently from the current WXT documentation and the difference cannot be resolved without production changes.
- A verification command fails twice after a reasonable correction.

## Maintenance notes

Every subsequent bug/security plan should add its regression test to this same harness. Keep unit tests focused on policy and state transitions; do not pretend that mocked WebGPU or canvas tests replace a real extension smoke test.
