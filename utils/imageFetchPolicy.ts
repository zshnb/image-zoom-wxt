export type ImageFetchPolicyResult =
  | { ok: true; url: URL; credentials: 'include' | 'omit' }
  | { ok: false; error: 'invalid_sender' | 'unsupported_or_private_url' }

export type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: 'image_too_large' | 'missing_body' | 'stream_error' }

export type ImageFetchResult =
  | { ok: true; bytes: Uint8Array; mimeType: string }
  | {
      ok: false
      error:
        | 'network_error'
        | 'http_error'
        | 'image_too_large'
        | 'missing_body'
        | 'stream_error'
        | 'not_an_image'
    }

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map(Number)
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? bytes
    : null
}

function isNonPublicIpv4(bytes: number[]): boolean {
  const [first, second, third] = bytes
  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first >= 224
  )
}

function parseIpv6(hostname: string): number[] | null {
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  if (!normalized.includes(':') || normalized.includes('%')) return null

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const raw = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
  if (raw.length !== 8 || raw.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null
  return raw.map((part) => Number.parseInt(part, 16))
}

function isNonPublicIpv6(parts: number[]): boolean {
  const allZeroBeforeLast = parts.slice(0, 7).every((part) => part === 0)
  if (parts.every((part) => part === 0) || (allZeroBeforeLast && parts[7] === 1)) return true
  if ((parts[0] & 0xfe00) === 0xfc00) return true
  if ((parts[0] & 0xffc0) === 0xfe80) return true
  if ((parts[0] & 0xff00) === 0xff00) return true

  const mappedIpv4 = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (mappedIpv4) {
    return isNonPublicIpv4([
      parts[6] >> 8,
      parts[6] & 0xff,
      parts[7] >> 8,
      parts[7] & 0xff,
    ])
  }
  return false
}

export function isPublicImageHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
  ) return false

  const ipv4 = parseIpv4(normalized)
  if (ipv4) return !isNonPublicIpv4(ipv4)
  const ipv6 = parseIpv6(normalized)
  if (ipv6) return !isNonPublicIpv6(ipv6)
  return true
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || !isPublicImageHostname(url.hostname)
    ) return null
    return url
  } catch {
    return null
  }
}

export function resolveImageFetchPolicy(
  requestedUrl: string,
  senderPageUrl: string,
): ImageFetchPolicyResult {
  const url = parseHttpUrl(requestedUrl)
  if (!url) return { ok: false, error: 'unsupported_or_private_url' }

  const senderUrl = parseHttpUrl(senderPageUrl)
  if (!senderUrl) return { ok: false, error: 'invalid_sender' }
  return {
    ok: true,
    url,
    credentials: url.origin === senderUrl.origin ? 'include' : 'omit',
  }
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  if (!response.body) return { ok: false, error: 'missing_body' }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, error: 'image_too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, error: 'stream_error' }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes }
}

export async function fetchBoundedImage(
  url: URL,
  credentials: 'include' | 'omit',
  maxBytes: number,
  fetcher: typeof fetch = fetch,
): Promise<ImageFetchResult> {
  let response: Response
  try {
    response = await fetcher(url, {
      cache: 'force-cache',
      credentials,
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    return { ok: false, error: 'network_error' }
  }
  if (!response.ok) return { ok: false, error: 'http_error' }

  const contentLengthValue = response.headers.get('content-length')
  if (contentLengthValue !== null) {
    const contentLength = Number(contentLengthValue)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: 'image_too_large' }
    }
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0].trim() || ''
  if (!mimeType.startsWith('image/')) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false, error: 'not_an_image' }
  }

  const body = await readBoundedResponseBody(response, maxBytes)
  if (!body.ok) return body
  return { ok: true, bytes: body.bytes, mimeType }
}
