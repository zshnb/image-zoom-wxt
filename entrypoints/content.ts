import {
  DEFAULT_AI_ENHANCEMENT_MODEL,
  DEFAULT_TRIGGER_SHORTCUT,
  aiEnhancementModel,
  disabledSites,
  imageEnhancementEnabled,
  imageEnhancementMode,
  isAiEnhancementModel,
  isImageEnhancementMode,
  isTriggerShortcutCode,
  resolveAiEnhancementModel,
  resolveImageEnhancementMode,
  triggerShortcut,
  type AiEnhancementModel,
  type ImageEnhancementMode,
  type TriggerShortcutCode,
} from '@/utils/storage'
import {
  createRealEsrganObjectUrl,
  disposeRealEsrgan,
  isEnhancementAbort,
  logImageEnhancement,
  type EnhancementLogContext,
} from '@/utils/realEsrgan'
import {
  getEnhancementOutcomeMessageKey,
  type AppliedEnhancementAlgorithm,
} from '@/utils/enhancementOutcome'
import { clearUpscaleCache, createUpscaleCacheKey } from '@/utils/upscaleCache'
import { resizeLanczos3, throwIfAborted } from '@/utils/lanczos'

type ToggleMessage = { type: 'TOGGLE_ZOOM'; enabled: boolean }
type ShortcutMessage = { type: 'UPDATE_SHORTCUT'; shortcut: TriggerShortcutCode }
type ImageEnhancementMessage = {
  type: 'UPDATE_IMAGE_ENHANCEMENT_MODE'
  mode: ImageEnhancementMode
}
type AiEnhancementModelMessage = {
  type: 'UPDATE_AI_ENHANCEMENT_MODEL'
  model: AiEnhancementModel
}
type PageStatusMessage = { type: 'GET_PAGE_STATUS' }
type DownloadImageResponse = { ok: boolean }
type FetchImageResponse =
  | {
      ok: true
      dataUrl: string
      bytes: number
      mimeType: string
      finalUrl: string
    }
  | { ok: false; error: string }
type ImageCandidate = { url: string; score: number }
type ImageSources = { urls: string[]; upgradeCount: number }
type ZoomOverlayElement = HTMLDivElement & {
  cleanupImageZoom?: () => void
  setImageEnhancementMode?: (mode: ImageEnhancementMode) => void
  setAiEnhancementModel?: (model: AiEnhancementModel) => void
}

const MAX_LANCZOS_SCALE = 4
const AI_UPSCALE_SCALE = 4
const MAX_LANCZOS_PIXELS = 6_000_000
const UPSCALE_IDLE_DELAY_MS = 120
const MIN_BACKGROUND_IMAGE_SIZE = 24
const IMAGE_DATA_ATTRIBUTES = [
  'data-full-src',
  'data-original-src',
  'data-high-res-src',
  'data-hires',
  'data-zoom-src',
  'data-large',
  'data-original',
  'data-lazy-src',
  'data-src',
] as const

function isToggleMessage(msg: unknown): msg is ToggleMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return candidate.type === 'TOGGLE_ZOOM' && typeof candidate.enabled === 'boolean'
}

function isShortcutMessage(msg: unknown): msg is ShortcutMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return candidate.type === 'UPDATE_SHORTCUT' && isTriggerShortcutCode(candidate.shortcut)
}

function isImageEnhancementMessage(msg: unknown): msg is ImageEnhancementMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return (
    candidate.type === 'UPDATE_IMAGE_ENHANCEMENT_MODE'
    && isImageEnhancementMode(candidate.mode)
  )
}

function isAiEnhancementModelMessage(msg: unknown): msg is AiEnhancementModelMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return (
    candidate.type === 'UPDATE_AI_ENHANCEMENT_MODEL'
    && isAiEnhancementModel(candidate.model)
  )
}

function isPageStatusMessage(msg: unknown): msg is PageStatusMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return candidate.type === 'GET_PAGE_STATUS'
}

function isDownloadImageResponse(msg: unknown): msg is DownloadImageResponse {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return typeof candidate.ok === 'boolean'
}

function isFetchImageResponse(msg: unknown): msg is FetchImageResponse {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  if (candidate.ok === false) return typeof candidate.error === 'string'
  return (
    candidate.ok === true
    && typeof candidate.dataUrl === 'string'
    && typeof candidate.bytes === 'number'
    && typeof candidate.mimeType === 'string'
    && typeof candidate.finalUrl === 'string'
  )
}

function canReadImagePixels(image: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return false

  try {
    context.drawImage(image, 0, 0, 1, 1)
    context.getImageData(0, 0, 1, 1)
    return true
  } catch {
    return false
  }
}

function loadDataImage(dataUrl: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'

    const cleanup = (): void => {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onLoad = (): void => {
      cleanup()
      resolve(image)
    }
    const onError = (): void => {
      cleanup()
      reject(new Error('Fetched image data could not be decoded'))
    }
    const onAbort = (): void => {
      cleanup()
      image.src = ''
      reject(new DOMException('Image enhancement canceled', 'AbortError'))
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    image.src = dataUrl
  })
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function getMessage(name: Parameters<typeof browser.i18n.getMessage>[0], fallback: string): string {
  return browser.i18n.getMessage(name) || fallback
}

function resolveImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'none') return null

  try {
    const url = new URL(trimmed, location.href)
    if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) return null
    return url.href
  } catch {
    return null
  }
}

function addImageCandidate(
  candidates: ImageCandidate[],
  value: string | null | undefined,
  score: number,
): void {
  const url = resolveImageUrl(value)
  if (url) candidates.push({ url, score })
}

function getSrcsetDescriptorScore(descriptor: string | undefined, baseWidth: number): number {
  if (!descriptor) return 1

  const value = Number.parseFloat(descriptor)
  if (!Number.isFinite(value) || value <= 0) return 1

  if (descriptor.endsWith('w')) return value
  if (descriptor.endsWith('x')) return value * Math.max(baseWidth, 1)
  return value
}

function addSrcsetCandidates(
  candidates: ImageCandidate[],
  srcset: string | null | undefined,
  baseWidth: number,
): void {
  if (!srcset) return

  let position = 0
  while (position < srcset.length) {
    while (position < srcset.length && /[\s,]/.test(srcset[position])) position += 1
    if (position >= srcset.length) break

    const urlStart = position
    while (position < srcset.length && !/\s/.test(srcset[position])) position += 1
    let url = srcset.slice(urlStart, position)
    let hasTrailingComma = false
    while (url.endsWith(',')) {
      url = url.slice(0, -1)
      hasTrailingComma = true
    }

    const descriptors: string[] = []
    if (!hasTrailingComma) {
      while (position < srcset.length && /\s/.test(srcset[position])) position += 1
      const descriptorStart = position
      while (position < srcset.length && srcset[position] !== ',') position += 1
      descriptors.push(...srcset.slice(descriptorStart, position).trim().split(/\s+/))
    }

    if (position < srcset.length && srcset[position] === ',') position += 1
    addImageCandidate(candidates, url, getSrcsetDescriptorScore(descriptors[0], baseWidth))
  }
}

function addUniqueImageUrl(urls: string[], value: string | null | undefined): void {
  const url = resolveImageUrl(value)
  if (url && !urls.includes(url)) urls.push(url)
}

function getImageElementSources(image: HTMLImageElement): ImageSources | null {
  const candidates: ImageCandidate[] = []
  const baseWidth = image.naturalWidth || image.width || 1
  const picture = image.parentElement instanceof HTMLPictureElement ? image.parentElement : null

  picture?.querySelectorAll<HTMLSourceElement>('source').forEach((source) => {
    if (source.media && !window.matchMedia(source.media).matches) return
    addSrcsetCandidates(candidates, source.srcset || source.getAttribute('srcset'), baseWidth)
  })

  addSrcsetCandidates(candidates, image.getAttribute('srcset'), baseWidth)
  addSrcsetCandidates(candidates, image.getAttribute('data-srcset'), baseWidth)

  IMAGE_DATA_ATTRIBUTES.forEach((attribute, index) => {
    addImageCandidate(
      candidates,
      image.getAttribute(attribute),
      baseWidth + 100 + IMAGE_DATA_ATTRIBUTES.length - index,
    )
  })

  candidates.sort((left, right) => right.score - left.score)

  const urls: string[] = []
  addUniqueImageUrl(urls, image.currentSrc)
  candidates.forEach((candidate) => addUniqueImageUrl(urls, candidate.url))
  const upgradeCount = Math.max(0, urls.length - 1)
  addUniqueImageUrl(urls, image.getAttribute('src'))
  addUniqueImageUrl(urls, image.src)

  return urls.length > 0 ? { urls, upgradeCount } : null
}

function getBackgroundImageUrl(el: HTMLElement): string | null {
  const backgroundImage = getComputedStyle(el).backgroundImage
  const match = backgroundImage.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/)
  return resolveImageUrl(match?.[1] ?? match?.[2] ?? match?.[3])
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the selection-based copy path.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  textarea.remove()
  return copied
}

function getDownloadFilename(src: string): string {
  if (src.startsWith('data:image/')) {
    const type = src.slice('data:image/'.length).split(/[;,]/)[0]
    return type ? `image.${type === 'jpeg' ? 'jpg' : type}` : 'image'
  }

  try {
    const url = new URL(src, location.href)
    const filename = url.pathname.split('/').filter(Boolean).pop()
    return filename ? decodeURIComponent(filename) : 'image'
  } catch {
    return 'image'
  }
}

function triggerAnchorDownload(src: string): void {
  const link = document.createElement('a')
  link.href = src
  link.download = getDownloadFilename(src)
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function createLanczosObjectUrl(
  source: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  signal: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal)
  const sourceWidth = source.naturalWidth
  const sourceHeight = source.naturalHeight
  if (sourceWidth < 1 || sourceHeight < 1) return null

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceWidth
  sourceCanvas.height = sourceHeight

  const sourceContext = sourceCanvas.getContext('2d')
  throwIfAborted(signal)
  if (!sourceContext) return null

  let imageData: ImageData
  try {
    throwIfAborted(signal)
    sourceContext.drawImage(source, 0, 0)
    imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  } catch {
    if (signal.aborted) throwIfAborted(signal)
    return null
  }

  const resized = await resizeLanczos3(
    imageData.data,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    signal,
  )
  throwIfAborted(signal)

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight

  const targetContext = targetCanvas.getContext('2d')
  throwIfAborted(signal)
  if (!targetContext) return null

  targetContext.putImageData(new ImageData(resized, targetWidth, targetHeight), 0, 0)
  throwIfAborted(signal)

  return new Promise((resolve, reject) => {
    targetCanvas.toBlob((blob) => {
      if (signal.aborted) {
        if (blob) {
          const canceledUrl = URL.createObjectURL(blob)
          URL.revokeObjectURL(canceledUrl)
        }
        reject(new DOMException('Image enhancement canceled', 'AbortError'))
        return
      }
      if (!blob) {
        resolve(null)
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      resolve(objectUrl)
    }, 'image/png')
  })
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main() {
    const hostname = location.hostname
    const [
      sites,
      storedShortcut,
      storedImageEnhancementMode,
      storedImageEnhancementEnabled,
      storedAiEnhancementModel,
    ] = await Promise.all([
      disabledSites.getValue(),
      triggerShortcut.getValue(),
      imageEnhancementMode.getValue(),
      imageEnhancementEnabled.getValue(),
      aiEnhancementModel.getValue(),
    ])
    let enabled = !sites.includes(hostname)
    let activeShortcut = isTriggerShortcutCode(storedShortcut)
      ? storedShortcut
      : DEFAULT_TRIGGER_SHORTCUT
    let activeEnhancementMode = resolveImageEnhancementMode(
      storedImageEnhancementMode,
      storedImageEnhancementEnabled,
    )
    let activeAiEnhancementModel = resolveAiEnhancementModel(storedAiEnhancementModel)
    let shortcutPressed = false

    const HOVERABLE_CLASS = 'image-zoom-hoverable'
    const TRIGGER_ACTIVE_CLASS = 'image-zoom-trigger-active'
    const OVERLAY_ID = 'image-zoom-overlay'
    const IMAGE_TRIGGER_CONTAINER_SELECTOR = 'a, button, [role="link"], [role="button"]'

    // --- CSS injection ---
    const style = document.createElement('style')
    style.textContent = `
      html.${TRIGGER_ACTIVE_CLASS} .${HOVERABLE_CLASS} { cursor: zoom-in !important; }
      #${OVERLAY_ID} {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(0, 0, 0, 0.85);
        display: flex; align-items: center; justify-content: center;
        cursor: zoom-out;
      }
      #${OVERLAY_ID} img {
        max-width: 90vw; max-height: 90vh; object-fit: contain;
        user-select: none;
        transform-origin: center center;
        will-change: transform;
        touch-action: none;
      }
      #${OVERLAY_ID} .image-zoom-toolbar {
        position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        display: flex; align-items: center; gap: 6px;
        z-index: 2;
        padding: 6px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        background: rgba(24, 24, 27, 0.72);
        backdrop-filter: blur(10px);
      }
      #${OVERLAY_ID} .image-zoom-toolbar button {
        display: inline-flex; align-items: center; justify-content: center;
        width: 38px; height: 38px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: rgba(39, 39, 42, 0.88);
        color: #fff;
        cursor: pointer;
      }
      #${OVERLAY_ID} .image-zoom-toolbar button:hover {
        background: rgba(63, 63, 70, 0.96);
      }
      #${OVERLAY_ID} .image-zoom-toolbar svg {
        width: 18px; height: 18px;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      #${OVERLAY_ID} .image-zoom-toolbar button:focus-visible {
        outline: 2px solid rgba(96, 165, 250, 0.95);
        outline-offset: 2px;
      }
      #${OVERLAY_ID} .image-zoom-status {
        position: absolute; top: 24px; left: 24px;
        z-index: 2;
        padding: 8px 10px; border-radius: 8px;
        background: rgba(24, 24, 27, 0.86);
        color: #fff;
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #${OVERLAY_ID} .image-zoom-status[hidden] { display: none; }
      #${OVERLAY_ID} .image-zoom-loading {
        position: absolute; top: 24px; left: 50%;
        transform: translateX(-50%);
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border-radius: 999px;
        background: rgba(24, 24, 27, 0.86);
        color: #fff;
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #${OVERLAY_ID} .image-zoom-loading[hidden] { display: none; }
      #${OVERLAY_ID} .image-zoom-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        border-radius: 999px;
        animation: image-zoom-spin 0.8s linear infinite;
      }
      @keyframes image-zoom-spin {
        to { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(style)

    function setTriggerActive(active: boolean): void {
      document.documentElement.classList.toggle(TRIGGER_ACTIVE_CLASS, enabled && active)
    }

    function releaseShortcut(): void {
      shortcutPressed = false
      setTriggerActive(false)
    }

    function setActiveShortcut(shortcut: TriggerShortcutCode): void {
      activeShortcut = shortcut
      releaseShortcut()
    }

    // --- Overlay ---
    function openOverlay(sources: ImageSources, alt: string): void {
      if (document.getElementById(OVERLAY_ID)) return

      const sourceUrls = sources.urls
      let src = sourceUrls[0]
      const sessionId = crypto.randomUUID()
      const enhancementContext: EnhancementLogContext = { sessionId }
      const overlay = document.createElement('div') as ZoomOverlayElement
      overlay.id = OVERLAY_ID
      logImageEnhancement('info', 'overlay_open', enhancementContext, {
        hostname,
        mode: activeEnhancementMode,
        aiModel: activeEnhancementMode === 'ai' ? activeAiEnhancementModel : undefined,
      })

      const img = document.createElement('img')
      img.alt = alt
      img.draggable = false

      const toolbar = document.createElement('div')
      toolbar.className = 'image-zoom-toolbar'
      toolbar.setAttribute('role', 'toolbar')

      const status = document.createElement('div')
      status.className = 'image-zoom-status'
      status.hidden = true
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')

      const loading = document.createElement('div')
      loading.className = 'image-zoom-loading'
      loading.hidden = true
      loading.setAttribute('role', 'status')
      loading.setAttribute('aria-live', 'polite')

      const spinner = document.createElement('span')
      spinner.className = 'image-zoom-spinner'

      const loadingLabel = document.createElement('span')
      loadingLabel.textContent = browser.i18n.getMessage('viewerImageProcessing')
        || 'Processing image'

      loading.append(spinner, loadingLabel)

      let currentScale = 1
      let targetScale = 1
      let translateX = 0
      let translateY = 0
      let animationFrame = 0
      let activePointerId: number | null = null
      let dragStartX = 0
      let dragStartY = 0
      let dragOriginX = 0
      let dragOriginY = 0
      let baseWidth = 0
      let baseHeight = 0
      let upscaleTimer = 0
      let upscaleRequestId = 0
      let upscaleAbortController: AbortController | null = null
      let inFlightUpscaleKey = ''
      let renderedUpscaleKey = ''
      let sourceReady = false
      let sourceFailed = false
      let displayReady = false
      let activeSourceIndex = 0
      let sourceGeneration = 0
      let upgradeAttempted = false
      let aiUpscaleActivated = false
      let overlayClosed = false
      let statusTimer = 0
      const upscaleCache = new Map<string, string>()
      let sourceImage = new Image()
      let sourceRecoveryPromise: Promise<HTMLImageElement | null> | null = null

      const showStatus = (message: string): void => {
        if (statusTimer) window.clearTimeout(statusTimer)
        status.textContent = message
        status.hidden = false
        statusTimer = window.setTimeout(() => {
          status.hidden = true
          statusTimer = 0
        }, 1800)
      }

      const recoverSourceImage = (
        context: EnhancementLogContext,
        signal?: AbortSignal,
      ): Promise<HTMLImageElement | null> => {
        if (sourceReady && !sourceFailed && canReadImagePixels(sourceImage)) {
          return Promise.resolve(sourceImage)
        }
        if (sourceRecoveryPromise) return sourceRecoveryPromise

        const recoveryGeneration = sourceGeneration
        const recoverySrc = src
        const startedAt = performance.now()
        logImageEnhancement('warn', 'source_pixels_unavailable', context, {
          sourceUrlOrigin: (() => {
            try {
              return new URL(recoverySrc, location.href).origin
            } catch {
              return 'invalid'
            }
          })(),
          recovery: 'background_fetch',
        })
        logImageEnhancement('info', 'source_fetch_request', context)

        sourceRecoveryPromise = browser.runtime.sendMessage({
          type: 'FETCH_IMAGE_FOR_ENHANCEMENT',
          url: recoverySrc,
        }).then(async (response: unknown) => {
          if (recoveryGeneration !== sourceGeneration || recoverySrc !== src) return null
          if (!isFetchImageResponse(response)) {
            logImageEnhancement('warn', 'source_fetch_recovery_failed', context, {
              reason: 'invalid_response',
              durationMs: Math.round(performance.now() - startedAt),
            })
            return null
          }
          if (!response.ok) {
            logImageEnhancement('warn', 'source_fetch_recovery_failed', context, {
              reason: response.error,
              durationMs: Math.round(performance.now() - startedAt),
            })
            return null
          }

          if (signal?.aborted || overlayClosed) {
            throw new DOMException('Image enhancement canceled', 'AbortError')
          }

          const recoveredImage = await loadDataImage(response.dataUrl, signal)
          if (
            overlayClosed
            || recoveryGeneration !== sourceGeneration
            || recoverySrc !== src
          ) return null

          sourceImage = recoveredImage
          sourceReady = true
          sourceFailed = false
          logImageEnhancement('info', 'source_fetch_recovery_complete', context, {
            bytes: response.bytes,
            mimeType: response.mimeType,
            finalHostname: new URL(response.finalUrl).hostname,
            durationMs: Math.round(performance.now() - startedAt),
          })
          return recoveredImage
        }).catch((error: unknown) => {
          if (!isEnhancementAbort(error)) {
            logImageEnhancement('warn', 'source_fetch_recovery_failed', context, {
              errorMessage: error instanceof Error ? error.message : String(error),
              durationMs: Math.round(performance.now() - startedAt),
            })
          }
          if (recoveryGeneration === sourceGeneration) sourceRecoveryPromise = null
          throw error
        })

        return sourceRecoveryPromise
      }

      const recoverCurrentSource = (): void => {
        void recoverSourceImage(enhancementContext).then((recoveredImage) => {
          if (!recoveredImage || overlayClosed) return
          scheduleUpscale()
        }).catch((error: unknown) => {
          if (!isEnhancementAbort(error)) {
            logImageEnhancement('warn', 'source_recovery_unavailable', enhancementContext, {
              errorMessage: error instanceof Error ? error.message : String(error),
            })
          }
        })
      }

      const createToolbarButton = (
        labelName: Parameters<typeof browser.i18n.getMessage>[0],
        fallbackLabel: string,
        iconPath: string,
        onClick: () => void,
      ): HTMLButtonElement => {
        const button = document.createElement('button')
        const label = getMessage(labelName, fallbackLabel)
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

        icon.setAttribute('viewBox', '0 0 24 24')
        icon.setAttribute('aria-hidden', 'true')
        icon.setAttribute('focusable', 'false')
        path.setAttribute('d', iconPath)
        icon.appendChild(path)

        button.type = 'button'
        button.title = label
        button.setAttribute('aria-label', label)
        button.appendChild(icon)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          onClick()
        })
        return button
      }

      const openOriginal = (): void => {
        window.open(src, '_blank', 'noopener,noreferrer')
      }

      const downloadOriginal = (): void => {
        if (src.startsWith('data:') || src.startsWith('blob:')) {
          triggerAnchorDownload(src)
          return
        }

        void browser.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGE',
          url: src,
          filename: getDownloadFilename(src),
        }).then((response: unknown) => {
          if (!isDownloadImageResponse(response) || !response.ok) {
            triggerAnchorDownload(src)
          }
        }).catch(() => {
          triggerAnchorDownload(src)
        })
      }

      const copyOriginalLink = (): void => {
        void copyTextToClipboard(src).then((copied) => {
          showStatus(
            copied
              ? getMessage('viewerLinkCopied', 'Copied link')
              : getMessage('viewerLinkCopyFailed', 'Copy failed'),
          )
        })
      }

      toolbar.append(
        createToolbarButton(
          'viewerOpenImage',
          'Open',
          'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
          openOriginal,
        ),
        createToolbarButton(
          'viewerCopyImageLink',
          'Copy',
          'M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1',
          copyOriginalLink,
        ),
        createToolbarButton(
          'viewerDownloadImage',
          'Save',
          'M12 3v12M7 10l5 5 5-5M5 21h14',
          downloadOriginal,
        ),
        createToolbarButton(
          'viewerClose',
          'Close',
          'M6 6l12 12M18 6 6 18',
          closeOverlay,
        ),
      )

      const renderTransform = (): void => {
        img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale})`
      }

      const setLoading = (isLoading: boolean): void => {
        loading.hidden = !isLoading
      }

      const restoreOriginalSource = (): void => {
        if (!renderedUpscaleKey) return
        renderedUpscaleKey = ''
        img.src = src
      }

      const cancelUpscale = (): void => {
        if (upscaleTimer) window.clearTimeout(upscaleTimer)
        upscaleTimer = 0
        if (upscaleAbortController) {
          upscaleAbortController.abort()
          upscaleAbortController = null
          logImageEnhancement('debug', 'request_canceled', enhancementContext, {
            requestId: upscaleRequestId,
            reason: 'viewer_state_changed',
          })
        }
        inFlightUpscaleKey = ''
        upscaleRequestId += 1
        setLoading(false)
        restoreOriginalSource()
      }

      const getUpscaleTarget = (): {
        key: string
        width: number
        height: number
        sourceGeneration: number
        mode: Exclude<ImageEnhancementMode, 'off'>
      } | null => {
        const mode = activeEnhancementMode
        if (
          mode === 'off'
          || baseWidth < 1
          || baseHeight < 1
          || !sourceReady
          || sourceFailed
        ) {
          return null
        }

        const sourceWidth = sourceImage.naturalWidth
        const sourceHeight = sourceImage.naturalHeight
        const sourcePixels = sourceWidth * sourceHeight
        if (sourceWidth < 1 || sourceHeight < 1 || sourcePixels >= MAX_LANCZOS_PIXELS) return null

        let upscaleScale = AI_UPSCALE_SCALE
        if (mode !== 'ai') {
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
          const wantedWidth = baseWidth * targetScale * pixelRatio
          const wantedHeight = baseHeight * targetScale * pixelRatio
          const neededScale = Math.max(wantedWidth / sourceWidth, wantedHeight / sourceHeight)

          if (neededScale < 1.15) return null
          upscaleScale = Math.min(MAX_LANCZOS_SCALE, Math.ceil(neededScale * 2) / 2)
        } else if (!aiUpscaleActivated) {
          return null
        }

        let width = Math.round(sourceWidth * upscaleScale)
        let height = Math.round(sourceHeight * upscaleScale)

        if (width * height > MAX_LANCZOS_PIXELS) {
          const cappedScale = Math.sqrt(MAX_LANCZOS_PIXELS / sourcePixels)
          if (cappedScale <= 1.05) return null

          upscaleScale = Math.min(upscaleScale, cappedScale)
          width = Math.round(sourceWidth * upscaleScale)
          height = Math.round(sourceHeight * upscaleScale)
        }

        if (width <= sourceWidth || height <= sourceHeight) return null

        return {
          key: createUpscaleCacheKey({
            sourceGeneration,
            mode,
            aiModel: activeAiEnhancementModel,
            width,
            height,
          }),
          width,
          height,
          sourceGeneration,
          mode,
        }
      }

      const showUpscaledSource = (url: string, key: string): void => {
        if (renderedUpscaleKey === key) return
        img.removeAttribute('srcset')
        renderedUpscaleKey = key
        img.src = url
      }

      const applyUpscale = async (): Promise<void> => {
        if (overlayClosed) return

        const target = getUpscaleTarget()
        if (!target) {
          cancelUpscale()
          return
        }

        if (renderedUpscaleKey === target.key) {
          setLoading(false)
          return
        }

        if (inFlightUpscaleKey === target.key) return

        const requestId = upscaleRequestId + 1
        upscaleRequestId = requestId
        const requestMode = target.mode
        const requestAiModel = activeAiEnhancementModel
        const requestSourceGeneration = target.sourceGeneration
        const requestContext = { ...enhancementContext, requestId }
        const cached = upscaleCache.get(target.key)
        if (cached) {
          logImageEnhancement('info', 'upscale_cache_hit', requestContext, {
            mode: requestMode,
            targetWidth: target.width,
            targetHeight: target.height,
          })
          setLoading(false)
          showUpscaledSource(cached, target.key)
          return
        }

        upscaleAbortController?.abort()
        const abortController = new AbortController()
        upscaleAbortController = abortController
        inFlightUpscaleKey = target.key
        let objectUrl: string | null = null
        let appliedAlgorithm: AppliedEnhancementAlgorithm = null
        let requestCanceled = false
        try {
          setLoading(true)
          await waitForNextFrame()
          logImageEnhancement('info', 'upscale_request_start', requestContext, {
            mode: requestMode,
            targetStrategy: requestMode === 'ai' ? 'fixed-maximum' : 'viewport',
            aiModel: requestMode === 'ai' ? requestAiModel : undefined,
            sourceWidth: sourceImage.naturalWidth,
            sourceHeight: sourceImage.naturalHeight,
            targetWidth: target.width,
            targetHeight: target.height,
          })
          const enhancementSource = canReadImagePixels(sourceImage)
            ? sourceImage
            : await recoverSourceImage(requestContext, abortController.signal)
          if (!enhancementSource) {
            throw new Error('Source image pixels are unavailable')
          }

          if (requestMode === 'ai') {
            try {
              const aiObjectUrl = await createRealEsrganObjectUrl(
                enhancementSource,
                target.width,
                target.height,
                requestAiModel,
                requestContext,
                abortController.signal,
              )
              if (aiObjectUrl) {
                objectUrl = aiObjectUrl
                appliedAlgorithm = 'ai'
              }
            } catch (error) {
              if (isEnhancementAbort(error)) throw error
              logImageEnhancement('warn', 'algorithm_fallback', requestContext, {
                from: requestAiModel,
                to: 'lanczos3',
                errorMessage: error instanceof Error ? error.message : String(error),
              })
            }
          }

          if (!objectUrl) {
            const startedAt = performance.now()
            logImageEnhancement('info', 'lanczos_upscale_start', requestContext, {
              targetWidth: target.width,
              targetHeight: target.height,
            })
            const lanczosObjectUrl = await createLanczosObjectUrl(
              enhancementSource,
              target.width,
              target.height,
              abortController.signal,
            )
            if (lanczosObjectUrl) {
              objectUrl = lanczosObjectUrl
              appliedAlgorithm = 'lanczos'
            }
            logImageEnhancement('info', 'lanczos_upscale_complete', requestContext, {
              durationMs: Math.round(performance.now() - startedAt),
              success: objectUrl !== null,
            })
          }
        } catch (error) {
          if (isEnhancementAbort(error)) {
            requestCanceled = true
            logImageEnhancement('debug', 'upscale_request_aborted', requestContext, {
              mode: requestMode,
            })
          } else {
            logImageEnhancement('error', 'upscale_request_failed', requestContext, {
              mode: requestMode,
              errorMessage: error instanceof Error ? error.message : String(error),
            })
          }
          objectUrl = null
        } finally {
          if (upscaleAbortController === abortController) {
            upscaleAbortController = null
            inFlightUpscaleKey = ''
          }
          if (
            !overlayClosed
            && requestId === upscaleRequestId
            && requestSourceGeneration === sourceGeneration
          ) {
            setLoading(false)
          }
        }

        if (
          overlayClosed
          || requestId !== upscaleRequestId
          || requestSourceGeneration !== sourceGeneration
        ) {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          return
        }

        if (!objectUrl) {
          sourceFailed = true
          restoreOriginalSource()
          const outcomeKey = getEnhancementOutcomeMessageKey({
            requestedMode: requestMode,
            appliedAlgorithm,
            canceled: requestCanceled,
          })
          if (outcomeKey) {
            showStatus(browser.i18n.getMessage(outcomeKey) || 'Couldn’t create clearer image')
          }
          return
        }

        upscaleCache.set(target.key, objectUrl)
        showUpscaledSource(objectUrl, target.key)
        logImageEnhancement('info', 'upscale_request_applied', requestContext, {
          mode: requestMode,
          appliedAlgorithm,
          cacheKey: target.key,
        })
        const outcomeKey = getEnhancementOutcomeMessageKey({
          requestedMode: requestMode,
          appliedAlgorithm,
        })
        if (outcomeKey) {
          showStatus(browser.i18n.getMessage(outcomeKey))
        }
      }

      const scheduleUpscale = (): void => {
        if (
          overlayClosed
          || activeEnhancementMode === 'off'
          || (activeEnhancementMode === 'ai' && !aiUpscaleActivated)
        ) return
        if (upscaleTimer) window.clearTimeout(upscaleTimer)

        logImageEnhancement('debug', 'upscale_scheduled', enhancementContext, {
          mode: activeEnhancementMode,
          delayMs: UPSCALE_IDLE_DELAY_MS,
          targetScale,
        })

        upscaleTimer = window.setTimeout(() => {
          upscaleTimer = 0
          void applyUpscale()
        }, UPSCALE_IDLE_DELAY_MS)
      }

      const lockBaseSize = (): void => {
        if (baseWidth > 0 || img.naturalWidth < 1 || img.naturalHeight < 1) return

        const rect = img.getBoundingClientRect()
        baseWidth = rect.width || img.naturalWidth
        baseHeight = rect.height || img.naturalHeight

        img.style.width = `${baseWidth}px`
        img.style.height = `${baseHeight}px`
        img.style.maxWidth = 'none'
        img.style.maxHeight = 'none'

        scheduleUpscale()
      }

      const applyScale = (): void => {
        animationFrame = 0
        const delta = targetScale - currentScale

        if (Math.abs(delta) < 0.001) {
          currentScale = targetScale
        } else {
          currentScale += delta * 0.18
          animationFrame = requestAnimationFrame(applyScale)
        }

        renderTransform()
      }

      const activateSource = (index: number): void => {
        if (index < 0 || index >= sourceUrls.length || overlayClosed) return
        if (sourceGeneration > 0) {
          cancelUpscale()
          clearUpscaleCache(upscaleCache)
        }

        activeSourceIndex = index
        src = sourceUrls[index]
        displayReady = false
        sourceReady = false
        sourceFailed = false
        sourceRecoveryPromise = null
        sourceGeneration += 1
        const generation = sourceGeneration

        const nextSourceImage = new Image()
        nextSourceImage.decoding = 'async'
        try {
          const sourceUrl = new URL(src, location.href)
          if (
            sourceUrl.origin !== location.origin
            && sourceUrl.protocol !== 'data:'
            && sourceUrl.protocol !== 'blob:'
          ) {
            nextSourceImage.crossOrigin = 'anonymous'
          }
        } catch {
          sourceFailed = true
        }

        nextSourceImage.addEventListener('load', () => {
          if (generation !== sourceGeneration || overlayClosed) return
          sourceReady = true
          sourceFailed = false
          scheduleUpscale()
        }, { once: true })
        nextSourceImage.addEventListener('error', () => {
          if (generation !== sourceGeneration || overlayClosed) return
          sourceFailed = true
          sourceReady = false
          if (displayReady) recoverCurrentSource()
        }, { once: true })
        sourceImage = nextSourceImage
        sourceImage.src = src
        img.src = src
      }

      const tryUpgradeSource = async (): Promise<void> => {
        const initialGeneration = sourceGeneration
        const initialWidth = img.naturalWidth
        const initialHeight = img.naturalHeight
        const lastUpgradeIndex = Math.min(sources.upgradeCount, sourceUrls.length - 1)

        for (let index = 1; index <= lastUpgradeIndex; index += 1) {
          const probe = new Image()
          probe.decoding = 'async'
          const loaded = await new Promise<boolean>((resolve) => {
            probe.addEventListener('load', () => resolve(true), { once: true })
            probe.addEventListener('error', () => resolve(false), { once: true })
            probe.src = sourceUrls[index]
          })

          if (overlayClosed || initialGeneration !== sourceGeneration) return
          if (!loaded) {
            logImageEnhancement('debug', 'source_candidate_failed', enhancementContext, {
              candidateIndex: index,
              phase: 'upgrade_probe',
            })
            continue
          }
          if (probe.naturalWidth <= initialWidth && probe.naturalHeight <= initialHeight) continue

          logImageEnhancement('info', 'source_candidate_upgraded', enhancementContext, {
            candidateIndex: index,
            fromWidth: initialWidth,
            fromHeight: initialHeight,
            toWidth: probe.naturalWidth,
            toHeight: probe.naturalHeight,
          })
          activateSource(index)
          return
        }
      }

      img.addEventListener('load', () => {
        displayReady = true
        requestAnimationFrame(lockBaseSize)
        if (sourceFailed) recoverCurrentSource()
        if (!upgradeAttempted && activeSourceIndex === 0 && sources.upgradeCount > 0) {
          upgradeAttempted = true
          void tryUpgradeSource()
        }
      })
      img.addEventListener('error', () => {
        displayReady = false
        const nextIndex = activeSourceIndex + 1
        logImageEnhancement('warn', 'source_candidate_failed', enhancementContext, {
          candidateIndex: activeSourceIndex,
          remainingCandidates: Math.max(0, sourceUrls.length - nextIndex),
          phase: 'viewer_load',
        })
        if (nextIndex < sourceUrls.length) {
          activateSource(nextIndex)
          return
        }
        sourceFailed = true
        sourceReady = false
        logImageEnhancement('warn', 'source_direct_load_failed', enhancementContext, {
          attemptedCandidates: sourceUrls.length,
        })
      })
      activateSource(0)

      renderTransform()

      overlay.addEventListener('wheel', (e) => {
        e.preventDefault()
        targetScale *= e.deltaY < 0 ? 1.12 : 1 / 1.12
        targetScale = Math.max(1, Math.min(10, targetScale))
        if (
          activeEnhancementMode === 'ai'
          && !aiUpscaleActivated
          && e.deltaY < 0
          && targetScale > 1
        ) {
          aiUpscaleActivated = true
          logImageEnhancement('info', 'ai_upscale_activated', enhancementContext, {
            reason: 'user_zoom',
            targetScale,
          })
        }
        scheduleUpscale()
        if (!animationFrame) {
          animationFrame = requestAnimationFrame(applyScale)
        }
      }, { passive: false })

      img.addEventListener('pointerdown', (e) => {
        if (currentScale <= 1) return
        e.preventDefault()
        activePointerId = e.pointerId
        dragStartX = e.clientX
        dragStartY = e.clientY
        dragOriginX = translateX
        dragOriginY = translateY
        overlay.dataset.dragMoved = 'false'
        img.setPointerCapture(e.pointerId)
        overlay.style.cursor = 'grabbing'
      })

      img.addEventListener('pointermove', (e) => {
        if (activePointerId !== e.pointerId) return
        translateX = dragOriginX + (e.clientX - dragStartX)
        translateY = dragOriginY + (e.clientY - dragStartY)
        if (
          Math.abs(e.clientX - dragStartX) > 3
          || Math.abs(e.clientY - dragStartY) > 3
        ) {
          overlay.dataset.dragMoved = 'true'
        }
        renderTransform()
      })

      const stopDragging = (e: PointerEvent): void => {
        if (activePointerId !== e.pointerId) return
        if (img.hasPointerCapture(e.pointerId)) {
          img.releasePointerCapture(e.pointerId)
        }
        activePointerId = null
        overlay.style.cursor = 'zoom-out'
      }

      img.addEventListener('pointerup', stopDragging)
      img.addEventListener('pointercancel', stopDragging)
      img.addEventListener('dragstart', (e) => {
        e.preventDefault()
      })

      overlay.cleanupImageZoom = (): void => {
        overlayClosed = true
        logImageEnhancement('info', 'overlay_cleanup_start', enhancementContext, {
          cachedImages: upscaleCache.size,
        })
        if (statusTimer) window.clearTimeout(statusTimer)
        if (animationFrame) cancelAnimationFrame(animationFrame)
        cancelUpscale()
        clearUpscaleCache(upscaleCache)
        if (sourceImage.src.startsWith('data:')) sourceImage.src = ''
        logImageEnhancement('info', 'overlay_cleanup_complete', enhancementContext)
      }

      overlay.setImageEnhancementMode = (nextMode: ImageEnhancementMode): void => {
        cancelUpscale()
        logImageEnhancement('info', 'mode_changed', enhancementContext, {
          mode: nextMode,
        })
        if (nextMode === 'off') return
        if (nextMode === 'ai' && targetScale > 1) {
          aiUpscaleActivated = true
        }

        scheduleUpscale()
      }

      overlay.setAiEnhancementModel = (nextModel: AiEnhancementModel): void => {
        if (activeEnhancementMode !== 'ai') return
        cancelUpscale()
        logImageEnhancement('info', 'ai_model_changed', enhancementContext, {
          model: nextModel,
        })
        scheduleUpscale()
      }

      overlay.appendChild(toolbar)
      overlay.appendChild(img)
      overlay.appendChild(loading)
      overlay.appendChild(status)
      document.body.appendChild(overlay)
    }

    function closeOverlay(): void {
      const overlay = document.getElementById(OVERLAY_ID) as ZoomOverlayElement | null
      overlay?.cleanupImageZoom?.()
      overlay?.remove()
    }

    function applyImageEnhancementMode(value: ImageEnhancementMode): void {
      activeEnhancementMode = value
      const overlay = document.getElementById(OVERLAY_ID) as ZoomOverlayElement | null
      overlay?.setImageEnhancementMode?.(value)
    }

    function applyAiEnhancementModel(value: AiEnhancementModel): void {
      activeAiEnhancementModel = isAiEnhancementModel(value)
        ? value
        : DEFAULT_AI_ENHANCEMENT_MODEL
      const overlay = document.getElementById(OVERLAY_ID) as ZoomOverlayElement | null
      overlay?.setAiEnhancementModel?.(activeAiEnhancementModel)
    }

    // --- Image click handler ---
    function getImageSources(el: HTMLElement): ImageSources | null {
      if (el instanceof HTMLImageElement) return getImageElementSources(el)
      const url = getBackgroundImageUrl(el)
      return url ? { urls: [url], upgradeCount: 0 } : null
    }

    function getImageAlt(el: HTMLElement): string {
      if (el instanceof HTMLImageElement) return el.alt
      return el.getAttribute('aria-label') || el.getAttribute('title') || ''
    }

    function getBackgroundImageTarget(target: HTMLElement): HTMLElement | null {
      let current: HTMLElement | null = target

      while (current && current !== document.body) {
        if (current.closest(`#${OVERLAY_ID}`)) return null
        if (current instanceof HTMLImageElement) return null
        if (isVisibleImage(current) && getBackgroundImageUrl(current)) return current
        current = current.parentElement
      }

      return null
    }

    function getClickImageTarget(event: MouseEvent): HTMLElement | null {
      const path = event.composedPath().filter(
        (target): target is HTMLElement => target instanceof HTMLElement,
      )
      if (path.some((target) => target.closest(`#${OVERLAY_ID}`))) return null

      for (const target of path) {
        if (target instanceof HTMLImageElement && isVisibleImage(target)) return target
      }

      for (const target of path) {
        const backgroundTarget = getBackgroundImageTarget(target)
        if (backgroundTarget) return backgroundTarget
      }

      const containers = new Set<HTMLElement>()
      path.forEach((target) => {
        const container = target.closest<HTMLElement>(IMAGE_TRIGGER_CONTAINER_SELECTOR)
        if (container) containers.add(container)
      })

      for (const container of containers) {
        const images = [...container.querySelectorAll<HTMLImageElement>('img')]
          .filter(isVisibleImage)
        if (images.length === 1) return images[0]
      }

      return null
    }

    function handleClick(e: MouseEvent): void {
      if (!enabled) return
      const overlay = document.getElementById(OVERLAY_ID)
      if (overlay) {
        const target = e.target
        if (!(target instanceof HTMLElement)) return
        if (overlay instanceof HTMLElement && overlay.dataset.dragMoved === 'true') {
          overlay.dataset.dragMoved = 'false'
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (target.closest('.image-zoom-toolbar') || target.tagName === 'IMG') return
        e.preventDefault()
        e.stopPropagation()
        closeOverlay()
        return
      }
      if (!shortcutPressed) return
      const imageTarget = getClickImageTarget(e)
      if (!imageTarget) return
      e.preventDefault()
      e.stopPropagation()
      const sources = getImageSources(imageTarget)
      if (sources) openOverlay(sources, getImageAlt(imageTarget))
    }

    // --- Hover class management ---
    function isVisibleImage(el: HTMLElement): boolean {
      if (el instanceof HTMLImageElement) {
        return el.naturalWidth > 1 && el.naturalHeight > 1 && el.width > 1
      }

      const rect = el.getBoundingClientRect()
      return (
        rect.width >= MIN_BACKGROUND_IMAGE_SIZE
        && rect.height >= MIN_BACKGROUND_IMAGE_SIZE
        && getBackgroundImageUrl(el) !== null
      )
    }

    function addHoverable(el: HTMLElement): void {
      if (el.closest(`#${OVERLAY_ID}`)) return
      if (isVisibleImage(el)) {
        el.classList.add(HOVERABLE_CLASS)
        return
      }

      el.classList.remove(HOVERABLE_CLASS)
      if (el instanceof HTMLImageElement && !el.complete) {
        el.addEventListener('load', () => {
          if (enabled && isVisibleImage(el)) el.classList.add(HOVERABLE_CLASS)
        }, { once: true })
      }
    }

    function removeHoverable(el: HTMLElement): void {
      el.classList.remove(HOVERABLE_CLASS)
    }

    function scanImages(): void {
      document.querySelectorAll<HTMLElement>('img, [style*="background"]').forEach((el) => {
        if (enabled) addHoverable(el)
        else removeHoverable(el)
      })
    }

    // --- MutationObserver for dynamic content ---
    const observer = new MutationObserver((mutations) => {
      if (!enabled) return
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const target = mutation.target
          if (target instanceof HTMLImageElement) {
            addHoverable(target)
          } else if (target instanceof HTMLSourceElement) {
            target.closest('picture')?.querySelectorAll<HTMLImageElement>('img').forEach(addHoverable)
          } else if (
            target instanceof HTMLElement
            && mutation.attributeName === 'style'
            && (
              target.style.background
              || target.style.backgroundImage
              || target.classList.contains(HOVERABLE_CLASS)
            )
          ) {
            addHoverable(target)
          }
          continue
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches('img, [style*="background"]')) {
              addHoverable(node)
            }
            node.querySelectorAll<HTMLElement>('img, [style*="background"]').forEach(addHoverable)
          }
        })
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'style'],
    })

    // --- Global click listener ---
    document.addEventListener('click', handleClick, true)

    // --- Enable/disable ---
    function applyEnabled(value: boolean): void {
      enabled = value
      setTriggerActive(false)
      scanImages()
      if (!value) closeOverlay()
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById(OVERLAY_ID)) {
        e.preventDefault()
        e.stopPropagation()
        closeOverlay()
        return
      }

      if (e.code !== activeShortcut) return
      shortcutPressed = true
      setTriggerActive(true)
    }, true)

    document.addEventListener('keyup', (e) => {
      if (e.code === activeShortcut) releaseShortcut()
    }, true)

    window.addEventListener('blur', () => {
      releaseShortcut()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseShortcut()
    })

    triggerShortcut.watch((nextShortcut) => {
      setActiveShortcut(
        isTriggerShortcutCode(nextShortcut) ? nextShortcut : DEFAULT_TRIGGER_SHORTCUT,
      )
    })

    imageEnhancementMode.watch((nextMode) => {
      if (isImageEnhancementMode(nextMode)) applyImageEnhancementMode(nextMode)
    })

    aiEnhancementModel.watch((nextModel) => {
      applyAiEnhancementModel(nextModel)
    })

    disabledSites.watch((nextSites) => {
      applyEnabled(!nextSites.includes(hostname))
    })

    // Listen for toggle messages sent directly from popup via tabs.sendMessage
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (isPageStatusMessage(msg)) {
        return Promise.resolve({ hostname, enabled })
      }

      if (isToggleMessage(msg)) {
        applyEnabled(msg.enabled)
      }

      if (isShortcutMessage(msg)) {
        setActiveShortcut(msg.shortcut)
      }

      if (isImageEnhancementMessage(msg)) {
        applyImageEnhancementMode(msg.mode)
      }

      if (isAiEnhancementModelMessage(msg)) {
        applyAiEnhancementModel(msg.model)
      }
    })

    window.addEventListener('pagehide', () => {
      disposeRealEsrgan({ sessionId: 'content-script' })
    }, { once: true })

    // Initial scan - runs at document_idle after DOM is ready
    scanImages()
  },
})
