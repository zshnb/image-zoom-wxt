import { disabledSites } from '@/utils/storage'

type ToggleMessage = { type: 'TOGGLE_ZOOM'; enabled: boolean }

function isToggleMessage(msg: unknown): msg is ToggleMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as Record<string, unknown>
  return candidate.type === 'TOGGLE_ZOOM' && typeof candidate.enabled === 'boolean'
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main() {
    const hostname = location.hostname
    const sites = await disabledSites.getValue()
    let enabled = !sites.includes(hostname)

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

    // --- Overlay ---
    function openOverlay(src: string, alt: string): void {
      if (document.getElementById(OVERLAY_ID)) return

      const overlay = document.createElement('div')
      overlay.id = OVERLAY_ID

      const img = document.createElement('img')
      img.src = src
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

      const renderTransform = (): void => {
        img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale})`
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

      renderTransform()

      overlay.addEventListener('wheel', (e) => {
        e.preventDefault()
        targetScale *= e.deltaY < 0 ? 1.12 : 1 / 1.12
        targetScale = Math.max(0.2, Math.min(10, targetScale))
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

      overlay.appendChild(img)
      document.body.appendChild(overlay)
    }

    function closeOverlay(): void {
      document.getElementById(OVERLAY_ID)?.remove()
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
      if (!e.shiftKey) return
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
      if (e.key === 'Shift') setTriggerActive(true)
    }, true)

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') setTriggerActive(false)
    }, true)

    window.addEventListener('blur', () => {
      setTriggerActive(false)
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) setTriggerActive(false)
    })

    // Listen for toggle messages sent directly from popup via tabs.sendMessage
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (isToggleMessage(msg)) {
        applyEnabled(msg.enabled)
      }
    })

    // Initial scan — runs at document_idle after DOM is ready
    scanImages()
  },
})
