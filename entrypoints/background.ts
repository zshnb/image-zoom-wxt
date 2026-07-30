import {
  fetchBoundedImage,
  resolveImageFetchPolicy,
} from '@/utils/imageFetchPolicy'
import {
  NATIVE_ESRGAN_HOST_NAME,
  isCancelNativeEsrganMessage,
  isNativeEsrganHostResponse,
  isNativeEsrganUpscaleMessage,
  type NativeEsrganResponse,
  type NativeEsrganUpscaleMessage,
} from '@/utils/nativeEsrganProtocol'

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
const MAX_NATIVE_OUTPUT_BASE64_CHARS = 48 * 1024 * 1024
const BASE64_CHUNK_SIZE = 32 * 1024
const ENHANCEMENT_LOG_PREFIX = '[ImageZoom][enhancement]'
const nativeUpscalePorts = new Map<string, Browser.runtime.Port>()

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

function nativeRequestKey(tabId: number, requestId: string): string {
  return `${tabId}:${requestId}`
}

function runNativeEsrgan(
  msg: NativeEsrganUpscaleMessage,
  tabId: number,
): Promise<NativeEsrganResponse> {
  return new Promise((resolve) => {
    const key = nativeRequestKey(tabId, msg.requestId)
    let port: Browser.runtime.Port
    try {
      port = browser.runtime.connectNative(NATIVE_ESRGAN_HOST_NAME)
    } catch (error) {
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : 'native_host_unavailable',
      })
      return
    }

    nativeUpscalePorts.set(key, port)
    const chunks: string[] = []
    let expectedChunkIndex = 0
    let outputLength = 0
    let settled = false

    const finish = (response: NativeEsrganResponse): void => {
      if (settled) return
      settled = true
      nativeUpscalePorts.delete(key)
      port.disconnect()
      resolve(response)
    }

    port.onMessage.addListener((value: unknown) => {
      if (!isNativeEsrganHostResponse(value)) {
        finish({ ok: false, error: 'invalid_native_host_response' })
        return
      }

      if (value.type === 'error') {
        finish({ ok: false, error: value.error })
        return
      }

      if (value.type === 'chunk') {
        if (value.index !== expectedChunkIndex) {
          finish({ ok: false, error: 'invalid_native_chunk_order' })
          return
        }
        outputLength += value.data.length
        if (outputLength > MAX_NATIVE_OUTPUT_BASE64_CHARS) {
          finish({ ok: false, error: 'native_output_too_large' })
          return
        }
        chunks.push(value.data)
        expectedChunkIndex += 1
        return
      }

      if (expectedChunkIndex === 0) {
        finish({ ok: false, error: 'native_output_is_empty' })
        return
      }
      finish({
        ok: true,
        dataBase64: chunks.join(''),
        mimeType: value.mimeType,
      })
    })

    port.onDisconnect.addListener(() => {
      finish({ ok: false, error: 'native_host_disconnected' })
    })

    try {
      port.postMessage({
        type: 'upscale',
        requestId: msg.requestId,
        imageBase64: msg.imageBase64,
        model: msg.model,
      })
    } catch (error) {
      finish({
        ok: false,
        error: error instanceof Error ? error.message : 'native_request_failed',
      })
    }
  })
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    if (isNativeEsrganUpscaleMessage(msg)) {
      if (sender.tab?.id === undefined) {
        sendResponse({ ok: false, error: 'invalid_sender' })
        return false
      }

      void runNativeEsrgan(msg, sender.tab.id).then(sendResponse)
      return true
    }

    if (isCancelNativeEsrganMessage(msg)) {
      if (sender.tab?.id === undefined) return false
      nativeUpscalePorts
        .get(nativeRequestKey(sender.tab.id, msg.requestId))
        ?.disconnect()
      return false
    }

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
