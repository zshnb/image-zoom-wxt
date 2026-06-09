import {
  DEFAULT_TRIGGER_SHORTCUT,
  disabledSites,
  isTriggerShortcutCode,
  triggerShortcut,
  type TriggerShortcutCode,
} from '@/utils/storage'

type ToggleMessage = { type: 'TOGGLE_ZOOM'; enabled: boolean }
type ShortcutMessage = { type: 'UPDATE_SHORTCUT'; shortcut: TriggerShortcutCode }
type ResizeWeight = { indices: number[]; weights: number[] }
type ZoomOverlayElement = HTMLDivElement & { cleanupImageZoom?: () => void }

const LANCZOS_RADIUS = 3
const MAX_LANCZOS_SCALE = 4
const MAX_LANCZOS_PIXELS = 6_000_000
const UPSCALE_IDLE_DELAY_MS = 120

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

function sinc(value: number): number {
  if (value === 0) return 1
  const angle = Math.PI * value
  return Math.sin(angle) / angle
}

function lanczos3(value: number): number {
  const x = Math.abs(value)
  if (x >= LANCZOS_RADIUS) return 0
  return sinc(x) * sinc(x / LANCZOS_RADIUS)
}

function createLanczosWeights(sourceSize: number, targetSize: number): ResizeWeight[] {
  const scale = targetSize / sourceSize
  const weights: ResizeWeight[] = []

  for (let target = 0; target < targetSize; target += 1) {
    const sourceCenter = (target + 0.5) / scale - 0.5
    const start = Math.ceil(sourceCenter - LANCZOS_RADIUS)
    const end = Math.floor(sourceCenter + LANCZOS_RADIUS)
    const indices: number[] = []
    const values: number[] = []
    let total = 0

    for (let source = start; source <= end; source += 1) {
      if (source < 0 || source >= sourceSize) continue

      const weight = lanczos3(sourceCenter - source)
      if (weight === 0) continue

      indices.push(source)
      values.push(weight)
      total += weight
    }

    if (total !== 0) {
      for (let i = 0; i < values.length; i += 1) {
        values[i] /= total
      }
    }

    weights.push({ indices, weights: values })
  }

  return weights
}

function resizeLanczos3(
  sourceData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray<ArrayBuffer> {
  const horizontalWeights = createLanczosWeights(sourceWidth, targetWidth)
  const verticalWeights = createLanczosWeights(sourceHeight, targetHeight)
  const horizontal = new Float32Array(targetWidth * sourceHeight * 4)
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4)

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const { indices, weights } = horizontalWeights[x]
      const targetOffset = (y * targetWidth + x) * 4

      for (let i = 0; i < indices.length; i += 1) {
        const sourceOffset = (y * sourceWidth + indices[i]) * 4
        const weight = weights[i]
        horizontal[targetOffset] += sourceData[sourceOffset] * weight
        horizontal[targetOffset + 1] += sourceData[sourceOffset + 1] * weight
        horizontal[targetOffset + 2] += sourceData[sourceOffset + 2] * weight
        horizontal[targetOffset + 3] += sourceData[sourceOffset + 3] * weight
      }
    }
  }

  for (let y = 0; y < targetHeight; y += 1) {
    const { indices, weights } = verticalWeights[y]

    for (let x = 0; x < targetWidth; x += 1) {
      const targetOffset = (y * targetWidth + x) * 4
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (let i = 0; i < indices.length; i += 1) {
        const sourceOffset = (indices[i] * targetWidth + x) * 4
        const weight = weights[i]
        red += horizontal[sourceOffset] * weight
        green += horizontal[sourceOffset + 1] * weight
        blue += horizontal[sourceOffset + 2] * weight
        alpha += horizontal[sourceOffset + 3] * weight
      }

      output[targetOffset] = red
      output[targetOffset + 1] = green
      output[targetOffset + 2] = blue
      output[targetOffset + 3] = alpha
    }
  }

  return output
}

async function createLanczosObjectUrl(
  source: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
): Promise<string | null> {
  const sourceWidth = source.naturalWidth
  const sourceHeight = source.naturalHeight
  if (sourceWidth < 1 || sourceHeight < 1) return null

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceWidth
  sourceCanvas.height = sourceHeight

  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) return null

  let imageData: ImageData
  try {
    sourceContext.drawImage(source, 0, 0)
    imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  } catch {
    return null
  }

  const resized = resizeLanczos3(
    imageData.data,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  )

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight

  const targetContext = targetCanvas.getContext('2d')
  if (!targetContext) return null

  targetContext.putImageData(new ImageData(resized, targetWidth, targetHeight), 0, 0)

  return new Promise((resolve) => {
    targetCanvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null)
    }, 'image/png')
  })
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main() {
    const hostname = location.hostname
    const [sites, storedShortcut] = await Promise.all([
      disabledSites.getValue(),
      triggerShortcut.getValue(),
    ])
    let enabled = !sites.includes(hostname)
    let activeShortcut = isTriggerShortcutCode(storedShortcut)
      ? storedShortcut
      : DEFAULT_TRIGGER_SHORTCUT
    let shortcutPressed = false

    const HOVERABLE_CLASS = 'image-zoom-hoverable'
    const TRIGGER_ACTIVE_CLASS = 'image-zoom-trigger-active'
    const OVERLAY_ID = 'image-zoom-overlay'
    const IMAGE_TRIGGER_CONTAINER_SELECTOR = 'button, [role="button"]'

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
    function openOverlay(src: string, alt: string): void {
      if (document.getElementById(OVERLAY_ID)) return

      const overlay = document.createElement('div') as ZoomOverlayElement
      overlay.id = OVERLAY_ID

      const img = document.createElement('img')
      img.alt = alt
      img.draggable = false

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
      let renderedUpscaleKey = ''
      let sourceReady = false
      let sourceFailed = false
      let overlayClosed = false
      const upscaleCache = new Map<string, string>()
      const sourceImage = new Image()

      const renderTransform = (): void => {
        img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale})`
      }

      const restoreOriginalSource = (): void => {
        if (!renderedUpscaleKey) return
        renderedUpscaleKey = ''
        img.src = src
      }

      const getUpscaleTarget = (): { key: string; width: number; height: number } | null => {
        if (baseWidth < 1 || baseHeight < 1 || !sourceReady || sourceFailed) return null

        const sourceWidth = sourceImage.naturalWidth
        const sourceHeight = sourceImage.naturalHeight
        const sourcePixels = sourceWidth * sourceHeight
        if (sourceWidth < 1 || sourceHeight < 1 || sourcePixels >= MAX_LANCZOS_PIXELS) return null

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const wantedWidth = baseWidth * targetScale * pixelRatio
        const wantedHeight = baseHeight * targetScale * pixelRatio
        const neededScale = Math.max(wantedWidth / sourceWidth, wantedHeight / sourceHeight)

        if (neededScale < 1.15) return null

        let upscaleScale = Math.min(MAX_LANCZOS_SCALE, Math.ceil(neededScale * 2) / 2)
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
          key: `${width}x${height}`,
          width,
          height,
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
          upscaleRequestId += 1
          restoreOriginalSource()
          return
        }

        if (renderedUpscaleKey === target.key) return

        const requestId = upscaleRequestId + 1
        upscaleRequestId = requestId
        const cached = upscaleCache.get(target.key)
        if (cached) {
          showUpscaledSource(cached, target.key)
          return
        }

        const objectUrl = await createLanczosObjectUrl(sourceImage, target.width, target.height)

        if (overlayClosed || requestId !== upscaleRequestId) {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          return
        }

        if (!objectUrl) {
          sourceFailed = true
          restoreOriginalSource()
          return
        }

        upscaleCache.set(target.key, objectUrl)
        showUpscaledSource(objectUrl, target.key)
      }

      const scheduleUpscale = (): void => {
        if (overlayClosed) return
        if (upscaleTimer) window.clearTimeout(upscaleTimer)

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

      sourceImage.decoding = 'async'
      try {
        const sourceUrl = new URL(src, location.href)
        if (sourceUrl.origin !== location.origin && sourceUrl.protocol !== 'data:' && sourceUrl.protocol !== 'blob:') {
          sourceImage.crossOrigin = 'anonymous'
        }
      } catch {
        sourceFailed = true
      }
      sourceImage.addEventListener('load', () => {
        sourceReady = true
        scheduleUpscale()
      }, { once: true })
      sourceImage.addEventListener('error', () => {
        sourceFailed = true
      }, { once: true })
      sourceImage.src = src

      img.addEventListener('load', () => {
        requestAnimationFrame(lockBaseSize)
      }, { once: true })
      img.src = src

      renderTransform()

      overlay.addEventListener('wheel', (e) => {
        e.preventDefault()
        targetScale *= e.deltaY < 0 ? 1.12 : 1 / 1.12
        targetScale = Math.max(1, Math.min(10, targetScale))
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
        upscaleRequestId += 1
        if (animationFrame) cancelAnimationFrame(animationFrame)
        if (upscaleTimer) window.clearTimeout(upscaleTimer)
        upscaleCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
        upscaleCache.clear()
      }

      overlay.appendChild(img)
      document.body.appendChild(overlay)
    }

    function closeOverlay(): void {
      const overlay = document.getElementById(OVERLAY_ID) as ZoomOverlayElement | null
      overlay?.cleanupImageZoom?.()
      overlay?.remove()
    }

    // --- Image click handler ---
    function getImageSrc(el: HTMLElement): string | null {
      if (el instanceof HTMLImageElement) return el.src
      const bg = getComputedStyle(el).backgroundImage
      const match = bg.match(/url\(["']?(.+?)["']?\)/)
      return match ? match[1] : null
    }

    function getImageAlt(el: HTMLElement): string {
      if (el instanceof HTMLImageElement) return el.alt
      return ''
    }

    function getClickImageTarget(target: HTMLElement): HTMLImageElement | null {
      if (target instanceof HTMLImageElement && target.classList.contains(HOVERABLE_CLASS)) {
        return target
      }

      const container = target.closest<HTMLElement>(IMAGE_TRIGGER_CONTAINER_SELECTOR)
      if (!container) return null

      const images = container.querySelectorAll<HTMLImageElement>(`img.${HOVERABLE_CLASS}`)
      return images.length === 1 ? images[0] : null
    }

    function handleClick(e: MouseEvent): void {
      if (!enabled) return
      const overlay = document.getElementById(OVERLAY_ID)
      if (overlay) {
        const target = e.target as HTMLElement
        if (overlay instanceof HTMLElement && overlay.dataset.dragMoved === 'true') {
          overlay.dataset.dragMoved = 'false'
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (target.tagName === 'IMG') return
        e.preventDefault()
        e.stopPropagation()
        closeOverlay()
        return
      }
      if (!shortcutPressed) return
      const target = e.target as HTMLElement
      const imageTarget = getClickImageTarget(target)
      if (!imageTarget) return
      e.preventDefault()
      e.stopPropagation()
      const src = getImageSrc(imageTarget)
      if (src) openOverlay(src, getImageAlt(imageTarget))
    }

    // --- Hover class management ---
    function isVisibleImage(el: HTMLElement): boolean {
      if (el instanceof HTMLImageElement) {
        return el.naturalWidth > 1 && el.naturalHeight > 1 && el.width > 1
      }
      const bg = getComputedStyle(el).backgroundImage
      return bg !== 'none' && bg !== ''
    }

    function addHoverable(el: HTMLElement): void {
      if (!(el instanceof HTMLImageElement)) return
      if (el.closest(`#${OVERLAY_ID}`)) return
      if (isVisibleImage(el)) {
        el.classList.add(HOVERABLE_CLASS)
      } else if (!el.complete) {
        el.addEventListener('load', () => {
          if (enabled && isVisibleImage(el)) el.classList.add(HOVERABLE_CLASS)
        }, { once: true })
      }
    }

    function removeHoverable(el: HTMLElement): void {
      el.classList.remove(HOVERABLE_CLASS)
    }

    function scanImages(): void {
      document.querySelectorAll<HTMLElement>('img').forEach((el) => {
        if (enabled) addHoverable(el)
        else removeHoverable(el)
      })
    }

    // --- MutationObserver for dynamic content ---
    const observer = new MutationObserver((mutations) => {
      if (!enabled) return
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches('img')) {
              addHoverable(node)
            }
            node.querySelectorAll<HTMLElement>('img').forEach(addHoverable)
          }
        })
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

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

    // Listen for toggle messages sent directly from popup via tabs.sendMessage
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (isToggleMessage(msg)) {
        applyEnabled(msg.enabled)
      }

      if (isShortcutMessage(msg)) {
        setActiveShortcut(msg.shortcut)
      }
    })

    // Initial scan - runs at document_idle after DOM is ready
    scanImages()
  },
})
