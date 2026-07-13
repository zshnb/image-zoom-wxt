# Plan 003: Bound and harden privileged image fetching

> **Executor instructions**: Follow every step and verification gate. Preserve ordinary viewing when enhancement fetch is rejected. Stop rather than weakening URL or response limits.
>
> **Drift check (run first)**: `git diff --stat ec2ea3b..HEAD -- entrypoints/background.ts entrypoints/content.ts utils/imageFetchPolicy.ts utils/imageFetchPolicy.test.ts`
> Compare any changed fetch/message code with the excerpts below before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-establish-test-baseline.md`
- **Category**: security / perf
- **Planned at**: commit `ec2ea3b`, 2026-07-11

## Why this matters

The background worker has all-site host access and fetches a URL derived from hostile page DOM. It currently follows redirects before validating the final destination, includes credentials, and buffers an unlimited response before enforcing its 12 MiB ceiling. The safe outcome for questionable images is not a broken viewer: enhancement should decline and the already-working original viewer should remain usable.

## Current state

```ts
// entrypoints/background.ts:117-125
const response = await fetch(url, {
  cache: 'force-cache',
  credentials: 'include',
  referrerPolicy: 'no-referrer',
})
if (!response.ok) return { ok: false, error: `http_${response.status}` }
const finalUrl = getFetchableImageUrl(response.url)
```

The post-fetch final URL check is too late to prevent the redirected request.

```ts
// entrypoints/background.ts:127-140
const contentLength = Number(response.headers.get('content-length'))
// early check only when header is honest
const bytes = new Uint8Array(await response.arrayBuffer())
if (bytes.byteLength > MAX_ENHANCEMENT_IMAGE_BYTES) return { ok: false, error: 'image_too_large' }
const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`
```

- `entrypoints/content.ts:761-811` treats `{ok:false}` as a recoverable enhancement failure; preserve that behavior.
- `getFetchableImageUrl` already restricts protocols and several private hostname forms. Extend it rather than introducing a second conflicting policy.
- Local rules forbid remote services and require optional enhancement to fail gracefully.

## Target policy

- Only `http:`/`https:` image fetches.
- Reject URL credentials and comprehensively normalized loopback, link-local, private, multicast, unspecified, and IPv4-mapped IPv6 literals.
- Reject redirects before following them (`redirect: 'error'` unless a tested platform limitation requires a stricter equivalent). Do not manually follow untrusted `Location` values.
- Include cookies only when the image origin exactly matches the sender tab's origin; use `credentials: 'omit'` for cross-origin CDN images.
- Stream the body, cancel immediately above 12 MiB, and bound Base64 conversion.
- Preserve generic error codes; do not return internal network detail to content.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- utils/imageFetchPolicy.test.ts` | all policy/boundary tests pass |
| Typecheck | `pnpm compile` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Chrome build | `pnpm build` | exit 0 |
| Firefox build | `pnpm build:firefox` | exit 0 |

## Scope

**In scope**:

- `entrypoints/background.ts`
- `entrypoints/content.ts` only if a response error code or sender context contract must be adjusted
- `utils/imageFetchPolicy.ts` (create for pure URL/credential policy if useful)
- `utils/imageFetchPolicy.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Adding DNS, webRequest, cookies, declarativeNetRequest, or any other permission.
- Uploading images or consulting a remote reputation service.
- Raising the 12 MiB limit.
- Changing normal viewer URL selection, downloads, or AI algorithms.
- Silently restoring automatic redirect following because a site breaks.

## Git workflow

- Branch: `codex/003-harden-image-fetch`
- Suggested commit: `fix: harden enhancement image fetching`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Extract a deterministic fetch policy

Create a pure helper only if it keeps tests independent from WXT background startup. It should accept requested URL and sender page URL and return either a rejection code or normalized URL plus credentials mode. Reuse one policy implementation from background.

Cover decimal/dotted IPv4 normalization, IPv6 loopback/link-local/ULA, IPv4-mapped IPv6, embedded URL credentials, invalid ports/protocols, same-origin credentials, and cross-origin omission.

**Verify**: `pnpm test -- utils/imageFetchPolicy.test.ts` → all table cases pass.

### Step 2: Bind the request to a valid tab sender

Require a valid `sender.tab.id` and parseable `sender.tab.url` for `FETCH_IMAGE_FOR_ENHANCEMENT`. Pass the sender page URL into the policy. Continue rejecting extension-page or otherwise unbound callers.

Do not apply this change to `DOWNLOAD_IMAGE` unless its separate behavior is explicitly reviewed; it is outside this finding.

**Verify**: add tests for missing tab URL, malformed tab URL, same-origin, and cross-origin callers → all pass.

### Step 3: Prevent redirect and credential escalation

Use the policy-selected credentials value and reject redirects at the fetch layer. Keep `referrerPolicy: 'no-referrer'`. Treat a redirect rejection as a normal `{ok:false}` enhancement response so content falls back without closing the viewer.

**Verify**: mocked-fetch tests confirm `redirect: 'error'`, same-origin `include`, cross-origin `omit`, and no second fetch for a redirect.

### Step 4: Enforce the byte limit while streaming

Read `response.body` through a reader, accumulate chunks while tracking total bytes, cancel as soon as the limit is exceeded, and combine only bounded chunks. Keep `Content-Length` as a fast rejection. Handle a missing body and stream errors with stable generic error codes.

Avoid repeatedly concatenating growing arrays. Allocate once after total size is known, copy chunks once, then Base64-encode with the existing bounded chunk size.

**Verify**: tests using synthetic streams cover exact limit, limit+1, missing/lying `Content-Length`, many small chunks, cancellation, stream error, wrong MIME, and valid small image.

### Step 5: Verify graceful browser behavior

In Chrome dev mode, test a same-origin authenticated image, a cross-origin public image, a redirecting image, and an oversized streamed response. The first two may enhance; rejected cases must retain the original viewer and stop the spinner.

**Verify**: `pnpm compile && pnpm test && pnpm build && pnpm build:firefox` → all exit 0.

## Test plan

- Pure policy tests for URL normalization/private ranges and credential selection.
- Background fetch tests with a mocked `fetch` and `ReadableStream` for redirect options, byte ceiling, cancellation, MIME, and error mapping.
- Manual Chrome smoke for authenticated same-origin and anonymous cross-origin images.

## Done criteria

- [ ] Redirects are rejected before being followed.
- [ ] Cross-origin enhancement fetches never include credentials.
- [ ] Same-origin authenticated images still work where allowed.
- [ ] More than 12 MiB is never fully buffered; reader cancellation is tested.
- [ ] Rejection leaves the normal viewer usable and loading UI cleared.
- [ ] No permissions were added.
- [ ] All four verification commands exit 0.
- [ ] Only in-scope files changed and plan status updated.

## STOP conditions

Stop and report if:

- The browser does not support rejecting redirects without first contacting the redirected target.
- Correct private-address handling would require a new permission or platform-specific DNS API.
- The proposed fix requires disabling ordinary cross-origin CDN images rather than fetching them anonymously.
- The content script stops falling back cleanly after two reasonable corrections.

## Maintenance notes

DNS rebinding cannot be fully solved by textual URL validation alone. Do not claim otherwise in comments or documentation. The durable boundaries are anonymous cross-origin requests, no redirects, strict byte/MIME limits, and graceful fallback. Revisit the policy whenever host permissions or supported URL schemes change.

