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

    const sites = await disabledSites.getValue()
    const currentSet = new Set(sites)

    if (nextEnabled) {
      currentSet.delete(hostname)
    } else {
      currentSet.add(hostname)
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
        rollbackSet.add(hostname)
      } else {
        rollbackSet.delete(hostname)
      }
      await disabledSites.setValue([...rollbackSet])
      setEnabled(!nextEnabled)
    }
  }

  const hostLabel =
    hostname === 'unsupported' ? 'Unsupported page' : hostname || 'Loading...'

  return (
    <main className="min-w-[280px] bg-zinc-900 p-4 text-zinc-100">
      <h1 className="text-sm font-semibold text-white">Image Zoom</h1>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">Site</span>
        <span className="max-w-[180px] truncate text-xs font-medium text-zinc-200">
          {hostLabel}
        </span>
      </div>

      <label
        className={`mt-3 flex items-center justify-between gap-2 ${ready ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
        aria-disabled={!ready}
      >
        <span className="text-xs text-zinc-400">Enable on this site</span>
        <input
          type="checkbox"
          className={`h-4 w-4 accent-blue-500 ${ready ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          checked={enabled}
          disabled={!ready}
          onChange={(e) => {
            void onToggle(e.target.checked)
          }}
        />
      </label>
    </main>
  )
}

export default App
