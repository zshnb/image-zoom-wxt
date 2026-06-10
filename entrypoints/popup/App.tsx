import { useEffect, useState } from 'react'
import {
  DEFAULT_TRIGGER_SHORTCUT,
  imageEnhancementEnabled,
  isTriggerShortcutCode,
  triggerShortcut,
  triggerShortcuts,
  type TriggerShortcutCode,
} from '@/utils/storage'

type ShortcutMessage = { type: 'UPDATE_SHORTCUT'; shortcut: TriggerShortcutCode }
type ImageEnhancementMessage = { type: 'UPDATE_IMAGE_ENHANCEMENT'; enabled: boolean }
type PopupMessage = ShortcutMessage | ImageEnhancementMessage
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type MessageName = Parameters<typeof browser.i18n.getMessage>[0]

function t(name: MessageName, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(name, substitutions) || name
}

function getStatusLabel(state: SaveState): string {
  if (state === 'idle') return ''
  if (state === 'saving') return t('popupShortcutSaving')
  if (state === 'saved') return t('popupShortcutSaved')
  return t('popupShortcutError')
}

function getStatusClass(state: SaveState): string {
  if (state === 'error') return 'text-red-600 dark:text-red-300'
  if (state === 'saved') return 'text-blue-700 dark:text-blue-300'
  return 'text-zinc-500 dark:text-zinc-400'
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null)
  const [shortcutCode, setShortcutCode] = useState<TriggerShortcutCode>(DEFAULT_TRIGGER_SHORTCUT)
  const [shortcutState, setShortcutState] = useState<SaveState>('idle')
  const [isImageEnhancementEnabled, setIsImageEnhancementEnabled] = useState(true)
  const [imageEnhancementState, setImageEnhancementState] = useState<SaveState>('idle')

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [[tab], storedShortcut, storedImageEnhancementEnabled] = await Promise.all([
        browser.tabs.query({ active: true, currentWindow: true }),
        triggerShortcut.getValue(),
        imageEnhancementEnabled.getValue(),
      ])

      setShortcutCode(
        isTriggerShortcutCode(storedShortcut) ? storedShortcut : DEFAULT_TRIGGER_SHORTCUT,
      )
      setIsImageEnhancementEnabled(storedImageEnhancementEnabled !== false)
      setTabId(tab?.id ?? null)
    }

    void init().catch(() => {
      setTabId(null)
    })
  }, [])

  const notifyActiveTab = async (message: PopupMessage): Promise<void> => {
    if (tabId === null) return

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
      await notifyActiveTab({ type: 'UPDATE_SHORTCUT', shortcut: value })
      setShortcutState('saved')
    } catch {
      setShortcutCode(previousShortcut)
      setShortcutState('error')
    }
  }

  const onImageEnhancementChange = async (enabled: boolean): Promise<void> => {
    const previousValue = isImageEnhancementEnabled
    setIsImageEnhancementEnabled(enabled)
    setImageEnhancementState('saving')

    try {
      await imageEnhancementEnabled.setValue(enabled)
      await notifyActiveTab({ type: 'UPDATE_IMAGE_ENHANCEMENT', enabled })
      setImageEnhancementState('saved')
    } catch {
      setIsImageEnhancementEnabled(previousValue)
      setImageEnhancementState('error')
    }
  }

  const shortcutStatusLabel = getStatusLabel(shortcutState)
  const imageEnhancementStatusLabel = getStatusLabel(imageEnhancementState)

  return (
    <main className="w-full bg-zinc-50 p-3 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">{t('extName')}</p>

        <div className="mt-3 flex items-end justify-between gap-3">
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
          {shortcutStatusLabel && (
            <span
              className={`pb-2 text-xs font-medium ${getStatusClass(shortcutState)}`}
            >
              {shortcutStatusLabel}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
            {t('popupImageEnhancement')}
          </p>
          <div className="flex items-center gap-2">
            {imageEnhancementStatusLabel && (
              <span
                className={`text-xs font-medium ${getStatusClass(imageEnhancementState)}`}
              >
                {imageEnhancementStatusLabel}
              </span>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={isImageEnhancementEnabled}
              aria-label={t('popupImageEnhancement')}
              disabled={imageEnhancementState === 'saving'}
              onClick={() => {
                void onImageEnhancementChange(!isImageEnhancementEnabled)
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-wait dark:focus:ring-blue-500 dark:focus:ring-offset-zinc-900 ${
                isImageEnhancementEnabled
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  isImageEnhancementEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
