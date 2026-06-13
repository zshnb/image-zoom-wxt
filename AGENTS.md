# AGENTS.md

## Project

This is a WXT + TypeScript + React Chrome MV3 extension for inspecting web images in an in-page zoom viewer.

Primary flow:
- `entrypoints/content.ts` runs the content script, detects shortcut-click image targets, resolves the best image URL, opens the overlay viewer, handles wheel zoom, drag panning, copy/open/download actions, and optional local Lanczos upscaling.
- `entrypoints/popup/App.tsx` renders popup settings for the trigger key, image clarity algorithm, and per-site enablement.
- `utils/storage.ts` owns persistent settings and allowed trigger shortcut codes.
- `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json` provide all user-facing extension text.
- `wxt.config.ts` owns manifest metadata, permissions, icons, WXT modules, and Tailwind integration.
- `README.md` contains Chrome Web Store listing copy. `store-assets/` contains store listing images.

## Local Rules

- Implement in a simple, clear style. Do not over-abstract.
- Keep the repository clean: no temporary files, dead code, dead files, or unnecessary folders.
- Use the existing WXT, TypeScript, React, Tailwind, and `browser.*` patterns.
- Use `pnpm`; do not introduce npm/yarn lockfiles.
- Keep browser permissions minimal. Do not add permissions, host access, remote calls, analytics, or tracking unless explicitly required.
- Keep image processing local to the browser. Do not upload image URLs or pixels to external services.
- Do not edit generated or dependency folders such as `.wxt`, `.output`, `node_modules`, or browser build artifacts.
- Before editing, check the current worktree and preserve unrelated user changes.
- After build, don't remove build folder

## Code Guidelines

- Prefer focused changes in the existing files over new abstractions or new directories.
- Keep shared persistent settings in `utils/storage.ts`.
- Validate runtime messages with type guards before using payloads.
- Keep content-script cleanup explicit: remove overlays/listeners/timers when closing the viewer or disabling a site.
- Be careful with cross-origin images and canvas tainting. Optional enhancement should fail gracefully and leave the normal viewer usable.
- Keep popup UI compact and extension-like. Use existing Tailwind utilities and avoid adding a UI library.
- When adding or changing visible text, update both `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`.
- Preserve WXT i18n manifest usage through `__MSG_*__` keys.
- Keep code formatted like the surrounding code: TypeScript ESM, no semicolons, clear local type aliases, and explicit async return types where the file already uses them.


## Development Commands

Install dependencies:

```bash
rtk pnpm install 2>&1 | head -c 6000
```

Run Chrome development build:

```bash
rtk pnpm dev 2>&1 | head -c 6000
```

Type-check:

```bash
rtk pnpm compile 2>&1 | head -c 6000
```

Build Chrome extension:

```bash
rtk pnpm build 2>&1 | head -c 6000
```

Create release zips:

```bash
rtk pnpm zip 2>&1 | head -c 6000
rtk pnpm zip:firefox 2>&1 | head -c 6000
```

## Validation

- For normal code changes, run the narrowest useful checks:

```bash
rtk pnpm compile 2>&1 | head -c 6000
rtk pnpm build 2>&1 | head -c 6000
```

- If browser compatibility, manifest, or WXT config changes, also run:

```bash
rtk pnpm build:firefox 2>&1 | head -c 6000
```

- If popup UI or content overlay behavior changes, manually verify the extension through WXT dev mode when feasible.
- If only store copy, documentation, or image assets change, explain why code validation was not run.
- There is currently no test script in `package.json`; do not refer to one unless it is added.
