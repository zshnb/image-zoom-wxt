# Plan 002: Restrict LiteRT runner access to authenticated extension sessions

> **Executor instructions**: Follow every step and verification gate. Stop on any listed STOP condition rather than weakening authentication. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat ec2ea3b..HEAD -- wxt.config.ts entrypoints/background.ts entrypoints/litert-runner/main.ts utils/realEsrgan.ts utils/runnerProtocol.ts utils/runnerProtocol.test.ts`
> If an in-scope file changed, compare live code with the excerpts below. Any semantic mismatch around runner creation or message handling is a STOP condition.

## Status

- **State**: ROLLED BACK — removed from `main` at user request after browser compatibility regressions
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: security
- **Planned at**: commit `ec2ea3b`, 2026-07-11

## Why this matters

The hidden LiteRT page and its large models are web-accessible to every site. The runner accepts the first parent-provided `MessagePort` without authenticating who created the frame, then trusts every request shape. A webpage that knows the extension ID can therefore embed the runner and consume significant CPU, GPU, and memory. The fix must preserve all-site image zoom while ensuring only a content-script session registered through the extension background can activate inference.

## Current state

- `wxt.config.ts` exposes the complete inference surface:

```ts
// wxt.config.ts:32-36
web_accessible_resources: [{
  resources: ['litert-runner.html', 'litert/wasm/*', 'models/*.tflite'],
  matches: ['<all_urls>'],
}]
```

- `utils/realEsrgan.ts:95-190` appends a hidden iframe directly to `document.documentElement`, creates a `MessageChannel`, and posts `IMAGE_ZOOM_LITERT_CONNECT`.
- The runner authenticates only parent window identity:

```ts
// entrypoints/litert-runner/main.ts:436-446
window.addEventListener('message', (event) => {
  if (connected || event.source !== parent || event.ports.length !== 1) return
  if ((event.data as Record<string, unknown>).type !== 'IMAGE_ZOOM_LITERT_CONNECT') return
  connected = true
  const port = event.ports[0]
})
```

- `entrypoints/litert-runner/main.ts:452-480` treats `message.data` as `RunnerRequest` without a runtime validator.
- Existing runtime boundary style uses small type guards, as shown by `isFetchImageMessage` in `entrypoints/background.ts:36-43`. Match that style: plain TypeScript, no schema library.
- The project must not add remote calls, analytics, or broader permissions. Inference and tokens remain local.

## Security design to implement

Use a one-time, short-lived runner session registered with the background service worker:

1. The content script asks background for a cryptographically random opaque runner token. Background records token, sender tab ID, and expiration.
2. The iframe is placed inside a **closed shadow root** so page scripts cannot traverse the DOM and read its URL/token. The token may be placed in the iframe URL fragment so it is not sent as a network path.
3. On startup, the extension iframe claims the token through `browser.runtime.sendMessage`. Background verifies same tab, unused token, and TTL, then consumes it.
4. Only after successful claim does the runner accept one `IMAGE_ZOOM_LITERT_CONNECT` message carrying the same token and one port.
5. Every port request is validated before accessing fields or invoking inference.

This is defense in depth: `use_dynamic_url` reduces stable fingerprinting but does not replace token authentication.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/runnerProtocol.test.ts` | all protocol/policy cases pass |
| Typecheck | `pnpm compile` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `wxt.config.ts`
- `entrypoints/background.ts`
- `entrypoints/litert-runner/main.ts`
- `utils/realEsrgan.ts`
- `utils/runnerProtocol.ts` (create if needed for shared types/guards)
- `utils/runnerProtocol.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Changing model files, model output, tiling, or backend selection.
- Adding `offscreen`, networking, telemetry, native messaging, or any new permission.
- Accepting a predictable token, a token supplied only by the webpage-visible parent, or `event.origin` alone as authentication.
- Broad refactoring of `content.ts`.

## Git workflow

- Branch: `codex/002-secure-litert-runner`
- Suggested commit: `fix: authenticate LiteRT runner sessions`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define and test the runner protocol

Create a small shared module containing request/response types and runtime guards. Validate:

- the exact request `type`;
- integer, positive request IDs;
- model names using `isAiEnhancementModel`;
- `input` typed-array class and exact element count for the selected model;
- required string fields in log context;
- cancel/dispose messages without accepting extra privileged operations.

Malformed input must produce a bounded error response or be ignored; it must never enter `getModel` or `runTile`.

**Verify**: `pnpm test -- utils/runnerProtocol.test.ts` → valid messages pass; malformed type, ID, model, input type, and input length are rejected.

### Step 2: Add one-time session issuance and claiming in background

Extend the existing background listener with two strictly validated internal messages: issue and claim. Store only token metadata in memory, use `crypto.randomUUID()` or equivalent secure randomness, expire entries after at most 30 seconds, consume on first valid claim, and cap/prune the map so abandoned sessions cannot grow indefinitely.

Both issue and claim must require `sender.tab?.id`. Claim must match the issuing tab. Do not log token values.

**Verify**: focused tests for the extracted token policy → wrong tab, expired, reused, unknown, and malformed tokens fail; the correct tab can claim once.

### Step 3: Hide the iframe and authenticate the handshake

In `createRunner`, request a session before creating the iframe. Put the iframe inside a detached host with a closed shadow root, then append only the host to the document. Carry the token in a non-network fragment or equivalent local channel. Ensure all failure/disposal paths remove the host, not only the iframe.

In the runner, claim the token with background before posting `READY` or accepting work. The connect message must carry the claimed token and exactly one port. Reject connection if claim fails, the token differs, or a connection already exists.

**Verify**: `pnpm compile` → exit 0.

### Step 4: Reduce static exposure

Set `use_dynamic_url: true` on the existing WAR entry. Keep only resources actually needed by the iframe; do not broaden matches or add new resources.

**Verify**: after `pnpm build`, inspect `.output/chrome-mv3/manifest.json` and confirm the WAR entry has `use_dynamic_url: true` and no new permissions.

### Step 5: Perform adversarial browser smoke checks

Load the built extension and verify:

1. normal AI enhancement still reaches `READY` and completes;
2. a normal webpage embedding `chrome-extension://<id>/litert-runner.html` cannot receive `READY` or run a tile without a background-issued token;
3. malformed port messages do not compile a model and do not break the next valid request;
4. removing the closed-shadow host or closing the viewer fails gracefully and permits a later retry.

Record the manual results in the PR/implementation handoff, not in source comments.

**Verify**: `pnpm build:firefox` → exit 0, then confirm the normal fallback viewer remains usable where AI is unavailable.

## Test plan

- `utils/runnerProtocol.test.ts`: message guards, exact input sizes/types, session issue/claim policy, TTL, replay, wrong-tab rejection.
- Manual Chrome extension check for isolation because a Node DOM mock cannot prove isolated-world/shadow-root behavior.
- Regression: valid general and x4plus requests still pass protocol validation.

## Done criteria

- [ ] A webpage cannot activate the runner without a background-issued, same-tab, one-time token.
- [ ] Port messages are runtime-validated before inference.
- [ ] Tokens expire, are capped, are never logged, and cannot be replayed.
- [ ] `use_dynamic_url` is present in built manifest; permissions did not increase.
- [ ] `pnpm compile`, `pnpm test`, `pnpm build`, and `pnpm build:firefox` exit 0.
- [ ] Only in-scope files changed.
- [ ] Plan 002 status is updated.

## STOP conditions

Stop and report if:

- An embedded extension iframe does not provide `sender.tab.id` when claiming a token.
- The page can read the token from the closed-shadow implementation during a real Chrome check.
- A secure solution requires a new manifest permission or dropping Firefox compatibility.
- The only remaining design authenticates a token chosen by the untrusted webpage itself.
- Normal AI inference cannot be restored after two reasonable attempts without weakening the boundary.

## Maintenance notes

Any future runner command must be added to the shared union and validator together. Reviewers should treat expansion of WAR resources, token TTL, accepted input sizes, and background message senders as security-sensitive changes.
