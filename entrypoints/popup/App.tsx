import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_TRIGGER_SHORTCUT,
  isTriggerShortcutCode,
  triggerShortcut,
  triggerShortcuts,
  type TriggerShortcutCode,
} from '@/utils/storage'

type ShortcutMessage = { type: 'UPDATE_SHORTCUT'; shortcut: TriggerShortcutCode }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type MessageName = Parameters<typeof browser.i18n.getMessage>[0]

function t(name: MessageName, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(name, substitutions) || name
}

function getShortcutLabel(code: TriggerShortcutCode): string {
  const shortcut = triggerShortcuts.find((item) => item.code === code) ?? triggerShortcuts[0]
  return t(shortcut.messageName)
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null)
  const [shortcutCode, setShortcutCode] = useState<TriggerShortcutCode>(DEFAULT_TRIGGER_SHORTCUT)
  const [shortcutState, setShortcutState] = useState<SaveState>('idle')

  const shortcutLabel = useMemo(() => getShortcutLabel(shortcutCode), [shortcutCode])

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [[tab], storedShortcut] = await Promise.all([
        browser.tabs.query({ active: true, currentWindow: true }),
        triggerShortcut.getValue(),
      ])

      setShortcutCode(
        isTriggerShortcutCode(storedShortcut) ? storedShortcut : DEFAULT_TRIGGER_SHORTCUT,
      )
      setTabId(tab?.id ?? null)
    }

    void init().catch(() => {
      setTabId(null)
    })
  }, [])

  const notifyShortcutChanged = async (nextShortcut: TriggerShortcutCode): Promise<void> => {
    if (tabId === null) return

    const message: ShortcutMessage = { type: 'UPDATE_SHORTCUT', shortcut: nextShortcut }
    try {
      await browser.tabs.sendMessage(tabId, message)
    } catch {
      // Some browser pages cannot receive content-script messages.
    }
  }

  const onShortcutChange = async (value: string): Promise<void> => {
    if (!isTriggerShortcutCode(value)) return

    const previousShortcut = shortcutCode
    setShortcutCode(value)
    setShortcutState('saving')

    try {
      await triggerShortcut.setValue(value)
      await notifyShortcutChanged(value)
      setShortcutState('saved')
    } catch {
      setShortcutCode(previousShortcut)
      setShortcutState('error')
    }
  }

  const shortcutStatusLabel = shortcutState === 'saving'
    ? t('popupShortcutSaving')
    : shortcutState === 'saved'
      ? t('popupShortcutSaved')
      : shortcutState === 'error'
        ? t('popupShortcutError')
        : t('popupShortcutDefault', shortcutLabel)

  return (
    <main className="w-[344px] bg-zinc-50 p-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_16px_42px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">{t('extName')}</p>
        <h1 className="mt-2 text-[22px] font-semibold leading-tight text-zinc-950 dark:text-white">
          {t('popupHeadline')}
        </h1>
        <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
          {t('popupDescription')}
        </p>
      </header>

      <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-end justify-between gap-3">
          <label className="flex-1">
            <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-500">
              {t('popupActivationKey')}
            </span>
            <select
              value={shortcutCode}
              onChange={(event) => {
                void onShortcutChange(event.target.value)
              }}
              className="mt-2 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-950 outline-none transition-colors focus:border-blue-600 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
            >
              {triggerShortcuts.map((shortcut) => (
                <option key={shortcut.code} value={shortcut.code}>
                  {t(shortcut.messageName)}
                </option>
              ))}
            </select>
          </label>
          <span
            className={`pb-2 text-xs font-medium ${
              shortcutState === 'error'
                ? 'text-red-600 dark:text-red-300'
                : shortcutState === 'saved'
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {shortcutStatusLabel}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {t('popupShortcutHint', shortcutLabel)}
        </p>
      </section>
    </main>
  )
}

export default App
