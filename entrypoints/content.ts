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
    const OVERLAY_ID = 'image-zoom-overlay'

    // --- CSS injection ---
    const style = document.createElement('style')
    style.textContent = `
      .${HOVERABLE_CLASS} { cursor: zoom-in !important; }
      #${OVERLAY_ID} {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(0, 0, 0, 0.85);
        display: flex; align-items: center; justify-content: center;
        cursor: zoom-out;
      }
      #${OVERLAY_ID} img {
        max-width: 90vw; max-height: 90vh; object-fit: contain;
        user-select: none;
      }
    `
    document.head.appendChild(style)

    // --- Overlay ---
    function openOverlay(src: string, alt: string): void {
      if (document.getElementById(OVERLAY_ID)) return

      const overlay = document.createElement('div')
      overlay.id = OVERLAY_ID

      const img = document.createElement('img')
      img.src = src
      img.alt = alt

      let scale = 1
      overlay.addEventListener('wheel', (e) => {
        e.preventDefault()
        scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15
        scale = Math.max(0.2, Math.min(10, scale))
        img.style.transform = `scale(${scale})`
      }, { passive: false })

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

    function handleClick(e: MouseEvent): void {
      if (!enabled) return
      if (document.getElementById(OVERLAY_ID)) {
        e.preventDefault()
        e.stopPropagation()
        closeOverlay()
        return
      }
      const target = e.target as HTMLElement
      if (!target.classList.contains(HOVERABLE_CLASS)) return
      e.preventDefault()
      e.stopPropagation()
      const src = getImageSrc(target)
      if (src) openOverlay(src, getImageAlt(target))
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
      if (el.closest('a')) return
      if (el.closest(`#${OVERLAY_ID}`)) return
      if (isVisibleImage(el)) {
        el.classList.add(HOVERABLE_CLASS)
      } else if (!el.complete) {
        el.addEventListener('load', () => {
          if (enabled && isVisibleImage(el) && !el.closest('a')) el.classList.add(HOVERABLE_CLASS)
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
      scanImages()
      if (!value) closeOverlay()
    }

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
