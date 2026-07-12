import {
  fetchBoundedImage,
  resolveImageFetchPolicy,
} from '@/utils/imageFetchPolicy'

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

async function fetchImageForEnhancement(
  urlValue: string,
  senderPageUrl: string,
): Promise<FetchImageResponse> {
  const policy = resolveImageFetchPolicy(urlValue, senderPageUrl)
  if (!policy.ok) return policy

  const startedAt = performance.now()
  logEnhancementFetch('info', 'source_fetch_start', { hostname: policy.url.hostname })

  const result = await fetchBoundedImage(
    policy.url,
    policy.credentials,
    MAX_ENHANCEMENT_IMAGE_BYTES,
  )
  if (!result.ok) {
    logEnhancementFetch('warn', 'source_fetch_failed', {
      hostname: policy.url.hostname,
      durationMs: Math.round(performance.now() - startedAt),
      error: result.error,
    })
    return result
  }

  const dataUrl = `data:${result.mimeType};base64,${bytesToBase64(result.bytes)}`
  logEnhancementFetch('info', 'source_fetch_complete', {
    hostname: policy.url.hostname,
    bytes: result.bytes.byteLength,
    mimeType: result.mimeType,
    durationMs: Math.round(performance.now() - startedAt),
  })
  return {
    ok: true,
    dataUrl,
    bytes: result.bytes.byteLength,
    mimeType: result.mimeType,
    finalUrl: policy.url.href,
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
      if (sender.tab?.id === undefined || typeof sender.tab.url !== 'string') {
        sendResponse({ ok: false, error: 'invalid_sender' })
        return false
      }

      void fetchImageForEnhancement(msg.url, sender.tab.url).then(sendResponse)
      return true
    }

    if (isDownloadImageMessage(msg)) {
      void downloadImage(msg).then(sendResponse)
      return true
    }

    return false
  })
})
