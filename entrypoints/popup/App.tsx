import { useEffect, useMemo, useState } from 'react'
import { disabledSites } from '@/utils/storage'

type ToggleMessage = { type: 'TOGGLE_ZOOM'; enabled: boolean }

function isSupportedTabUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null)
  const [hostname, setHostname] = useState<string>('')
  const [enabled, setEnabled] = useState<boolean>(true)

  const ready = useMemo(
    () => hostname.length > 0 && hostname !== 'unsupported',
    [hostname],
  )
  const isLoading = useMemo(() => hostname.length === 0, [hostname])
  const isUnsupported = useMemo(() => hostname === 'unsupported', [hostname])

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url
      if (!url || !isSupportedTabUrl(url) || !tab.id) {
        setHostname('unsupported')
        setEnabled(false)
        return
      }

      const current = new URL(url).hostname
      if (!current) {
        setHostname('unsupported')
        setEnabled(false)
        return
      }

      setTabId(tab.id)
      setHostname(current)

      const sites = await disabledSites.getValue()
      setEnabled(!sites.includes(current))
    }

    void init().catch(() => {
      setHostname('unsupported')
      setEnabled(false)
    })
  }, [])

  const onToggle = async (nextEnabled: boolean): Promise<void> => {
    if (!ready || tabId === null) return

    const currentHost = hostname
    const sites = await disabledSites.getValue()
    const currentSet = new Set(sites)

    if (nextEnabled) {
      currentSet.delete(currentHost)
    } else {
      currentSet.add(currentHost)
    }

    await disabledSites.setValue([...currentSet])
    setEnabled(nextEnabled)

    const message: ToggleMessage = { type: 'TOGGLE_ZOOM', enabled: nextEnabled }
    try {
      await browser.tabs.sendMessage(tabId, message)
    } catch {
      // Roll back UI and storage if content script is unreachable
      const rollbackSet = new Set(await disabledSites.getValue())
      if (nextEnabled) {
        rollbackSet.add(currentHost)
      } else {
        rollbackSet.delete(currentHost)
      }
      await disabledSites.setValue([...rollbackSet])
      setEnabled(!nextEnabled)
    }
  }

  const hostLabel = isUnsupported ? 'Unsupported page' : hostname || 'Loading...'
  const statusLabel = isLoading ? 'Loading' : ready ? (enabled ? 'On' : 'Off') : 'N/A'
  const helperText = isLoading
    ? 'Detecting active tab...'
    : ready
      ? 'Hold Shift and click an image to open the zoom overlay.'
      : 'This page does not allow zoom control.'

  return (
    <main className="min-w-[300px] bg-zinc-950 p-4 text-zinc-100">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Image Zoom</p>
          <h1 className="mt-1 text-base font-semibold text-white">Site control</h1>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
            isLoading
              ? 'bg-zinc-800 text-zinc-300'
              : ready
                ? enabled
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-zinc-800 text-zinc-200'
                : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {statusLabel}
        </span>
      </header>

      <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
        <p className="text-[11px] text-zinc-500">Current site</p>
        <p className="mt-1 truncate text-sm font-medium text-zinc-100">{hostLabel}</p>
      </section>

      <section
        className={`mt-3 rounded-xl border border-zinc-800 p-3 ${
          ready ? 'bg-zinc-900/40' : 'bg-zinc-900/20 opacity-70'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-100">Enable zoom</p>
            <p className="mt-1 text-xs text-zinc-400">{helperText}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Enable zoom on this site"
            disabled={!ready}
            onClick={() => {
              void onToggle(!enabled)
            }}
            className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
              ready ? (enabled ? 'bg-blue-500' : 'bg-zinc-700') : 'bg-zinc-800'
            } ${ready ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          >
            <span
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
