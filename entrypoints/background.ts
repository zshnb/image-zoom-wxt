type DownloadImageMessage = {
  type: 'DOWNLOAD_IMAGE'
  url: string
  filename: string
}

type FetchImageMessage = {
  type: 'FETCH_IMAGE_FOR_ENHANCEMENT'
  url: string
}

type FetchImageResponse =
  | {
      ok: true
      dataUrl: string
      bytes: number
      mimeType: string
      finalUrl: string
    }
  | { ok: false; error: string }

const MAX_ENHANCEMENT_IMAGE_BYTES = 12 * 1024 * 1024
const BASE64_CHUNK_SIZE = 32 * 1024
const ENHANCEMENT_LOG_PREFIX = '[ImageZoom][enhancement]'

function isDownloadImageMessage(msg: unknown): msg is DownloadImageMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return (
    candidate.type === 'DOWNLOAD_IMAGE'
    && typeof candidate.url === 'string'
    && typeof candidate.filename === 'string'
  )
}

function isFetchImageMessage(msg: unknown): msg is FetchImageMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return (
    candidate.type === 'FETCH_IMAGE_FOR_ENHANCEMENT'
    && typeof candidate.url === 'string'
  )
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '[::1]'
    || normalized.startsWith('[fc')
    || normalized.startsWith('[fd')
    || normalized.startsWith('[fe8')
    || normalized.startsWith('[fe9')
    || normalized.startsWith('[fea')
    || normalized.startsWith('[feb')
  ) return true

  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [first, second] = parts
  return (
    first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  )
}

function getFetchableImageUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || isPrivateHostname(url.hostname)
    ) return null
    return url
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

function logEnhancementFetch(
  level: 'info' | 'warn',
  event: string,
  data: Record<string, unknown>,
): void {
  console[level](`${ENHANCEMENT_LOG_PREFIX} ${event}`, {
    scope: 'image-zoom',
    component: 'background-image-fetch',
    event,
    timestamp: new Date().toISOString(),
    ...data,
  })
}

async function fetchImageForEnhancement(urlValue: string): Promise<FetchImageResponse> {
  const url = getFetchableImageUrl(urlValue)
  if (!url) return { ok: false, error: 'unsupported_or_private_url' }

  const startedAt = performance.now()
  logEnhancementFetch('info', 'source_fetch_start', { hostname: url.hostname })

  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'include',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) return { ok: false, error: `http_${response.status}` }

    const finalUrl = getFetchableImageUrl(response.url)
    if (!finalUrl) return { ok: false, error: 'unsafe_redirect_target' }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_ENHANCEMENT_IMAGE_BYTES) {
      return { ok: false, error: 'image_too_large' }
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0].trim() || ''
    if (!mimeType.startsWith('image/')) return { ok: false, error: 'not_an_image' }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_ENHANCEMENT_IMAGE_BYTES) {
      return { ok: false, error: 'image_too_large' }
    }

    const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`
    logEnhancementFetch('info', 'source_fetch_complete', {
      hostname: finalUrl.hostname,
      bytes: bytes.byteLength,
      mimeType,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return {
      ok: true,
      dataUrl,
      bytes: bytes.byteLength,
      mimeType,
      finalUrl: finalUrl.href,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logEnhancementFetch('warn', 'source_fetch_failed', {
      hostname: url.hostname,
      durationMs: Math.round(performance.now() - startedAt),
      errorMessage,
    })
    return { ok: false, error: errorMessage }
  }
}

function sanitizeDownloadFilename(filename: string): string {
  const clean = filename
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .trim()

  return clean || 'image'
}

async function downloadImage(msg: DownloadImageMessage): Promise<{ ok: boolean }> {
  try {
    const url = new URL(msg.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false }
    }

    await browser.downloads.download({
      url: url.href,
      filename: sanitizeDownloadFilename(msg.filename),
    })

    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    if (isFetchImageMessage(msg)) {
      if (sender.tab?.id === undefined) {
        sendResponse({ ok: false, error: 'invalid_sender' })
        return false
      }

      void fetchImageForEnhancement(msg.url).then(sendResponse)
      return true
    }

    if (isDownloadImageMessage(msg)) {
      void downloadImage(msg).then(sendResponse)
      return true
    }

    return false
  })
})
