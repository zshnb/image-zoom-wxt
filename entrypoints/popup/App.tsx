import { useEffect, useState } from 'react'
import {
  DEFAULT_AI_ENHANCEMENT_MODEL,
  DEFAULT_TRIGGER_SHORTCUT,
  aiEnhancementModel,
  aiEnhancementModels,
  disabledSites,
  imageEnhancementEnabled,
  imageEnhancementMode,
  imageEnhancementModes,
  isAiEnhancementModel,
  isImageEnhancementMode,
  isTriggerShortcutCode,
  resolveAiEnhancementModel,
  resolveImageEnhancementMode,
  triggerShortcut,
  triggerShortcuts,
  type AiEnhancementModel,
  type ImageEnhancementMode,
  type TriggerShortcutCode,
} from '@/utils/storage'

type ShortcutMessage = { type: 'UPDATE_SHORTCUT'; shortcut: TriggerShortcutCode }
type ImageEnhancementMessage = {
  type: 'UPDATE_IMAGE_ENHANCEMENT_MODE'
  mode: ImageEnhancementMode
}
type AiEnhancementModelMessage = {
  type: 'UPDATE_AI_ENHANCEMENT_MODEL'
  model: AiEnhancementModel
}
type ToggleMessage = { type: 'TOGGLE_ZOOM'; enabled: boolean }
type PageStatusMessage = { type: 'GET_PAGE_STATUS' }
type PageStatusResponse = { hostname: string; enabled: boolean }
type PopupMessage =
  | ShortcutMessage
  | ImageEnhancementMessage
  | AiEnhancementModelMessage
  | ToggleMessage
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

function isPageStatusResponse(value: unknown): value is PageStatusResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.hostname === 'string' && typeof candidate.enabled === 'boolean'
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null)
  const [shortcutCode, setShortcutCode] = useState<TriggerShortcutCode>(DEFAULT_TRIGGER_SHORTCUT)
  const [shortcutState, setShortcutState] = useState<SaveState>('idle')
  const [activeImageEnhancementMode, setActiveImageEnhancementMode] =
    useState<ImageEnhancementMode>('ai')
  const [imageEnhancementState, setImageEnhancementState] = useState<SaveState>('idle')
  const [activeAiEnhancementModel, setActiveAiEnhancementModel] =
    useState<AiEnhancementModel>(DEFAULT_AI_ENHANCEMENT_MODEL)
  const [aiEnhancementModelState, setAiEnhancementModelState] =
    useState<SaveState>('idle')
  const [hostname, setHostname] = useState('')
  const [isSiteEnabled, setIsSiteEnabled] = useState(true)
  const [siteState, setSiteState] = useState<SaveState>('idle')

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [
        [tab],
        storedShortcut,
        storedImageEnhancementMode,
        storedImageEnhancementEnabled,
        storedAiEnhancementModel,
      ] = await Promise.all([
        browser.tabs.query({ active: true, currentWindow: true }),
        triggerShortcut.getValue(),
        imageEnhancementMode.getValue(),
        imageEnhancementEnabled.getValue(),
        aiEnhancementModel.getValue(),
      ])
      const activeTabId = tab?.id ?? null

      setShortcutCode(
        isTriggerShortcutCode(storedShortcut) ? storedShortcut : DEFAULT_TRIGGER_SHORTCUT,
      )
      setActiveImageEnhancementMode(
        resolveImageEnhancementMode(
          storedImageEnhancementMode,
          storedImageEnhancementEnabled,
        ),
      )
      setActiveAiEnhancementModel(resolveAiEnhancementModel(storedAiEnhancementModel))
      setTabId(activeTabId)

      if (activeTabId === null) return

      try {
        const pageStatusMessage: PageStatusMessage = { type: 'GET_PAGE_STATUS' }
        const response = await browser.tabs.sendMessage(activeTabId, pageStatusMessage)
        if (isPageStatusResponse(response)) {
          setHostname(response.hostname)
          setIsSiteEnabled(response.enabled)
        }
      } catch {
        setHostname('')
      }
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

  const onImageEnhancementChange = async (value: string): Promise<void> => {
    if (!isImageEnhancementMode(value)) return

    const previousValue = activeImageEnhancementMode
    setActiveImageEnhancementMode(value)
    setImageEnhancementState('saving')

    try {
      await Promise.all([
        imageEnhancementMode.setValue(value),
        imageEnhancementEnabled.setValue(value !== 'off'),
      ])
      await notifyActiveTab({ type: 'UPDATE_IMAGE_ENHANCEMENT_MODE', mode: value })
      setImageEnhancementState('saved')
    } catch {
      setActiveImageEnhancementMode(previousValue)
      setImageEnhancementState('error')
    }
  }

  const onAiEnhancementModelChange = async (value: string): Promise<void> => {
    if (!isAiEnhancementModel(value)) return

    const previousValue = activeAiEnhancementModel
    setActiveAiEnhancementModel(value)
    setAiEnhancementModelState('saving')

    try {
      await aiEnhancementModel.setValue(value)
      await notifyActiveTab({ type: 'UPDATE_AI_ENHANCEMENT_MODEL', model: value })
      setAiEnhancementModelState('saved')
    } catch {
      setActiveAiEnhancementModel(previousValue)
      setAiEnhancementModelState('error')
    }
  }

  const onSiteEnabledChange = async (enabled: boolean): Promise<void> => {
    if (!hostname) return

    const previousValue = isSiteEnabled
    setIsSiteEnabled(enabled)
    setSiteState('saving')

    try {
      const sites = await disabledSites.getValue()
      const nextSites = enabled
        ? sites.filter((site) => site !== hostname)
        : Array.from(new Set([...sites, hostname]))

      await disabledSites.setValue(nextSites)
      await notifyActiveTab({ type: 'TOGGLE_ZOOM', enabled })
      setSiteState('saved')
    } catch {
      setIsSiteEnabled(previousValue)
      setSiteState('error')
    }
  }

  const shortcutStatusLabel = getStatusLabel(shortcutState)
  const imageEnhancementStatusLabel = getStatusLabel(imageEnhancementState)
  const aiEnhancementModelStatusLabel = getStatusLabel(aiEnhancementModelState)
  const siteStatusLabel = getStatusLabel(siteState)

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

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <label className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-950 dark:text-zinc-100">
              {t('popupImageEnhancement')}
            </span>
            <select
              value={activeImageEnhancementMode}
              disabled={imageEnhancementState === 'saving'}
              onChange={(event) => {
                void onImageEnhancementChange(event.target.value)
              }}
              className="mt-2 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-950 outline-none transition-colors focus:border-blue-600 focus:bg-white disabled:cursor-wait dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
            >
              {imageEnhancementModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {t(mode.messageName)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-h-10 items-center pb-0.5">
            {imageEnhancementStatusLabel && (
              <span
                className={`text-xs font-medium ${getStatusClass(imageEnhancementState)}`}
              >
                {imageEnhancementStatusLabel}
              </span>
            )}
          </div>
        </div>

        {activeImageEnhancementMode === 'ai' && (
          <div className="mt-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
            <div className="flex items-end justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('popupAiEnhancementModel')}
                </span>
                <select
                  value={activeAiEnhancementModel}
                  disabled={aiEnhancementModelState === 'saving'}
                  onChange={(event) => {
                    void onAiEnhancementModelChange(event.target.value)
                  }}
                  className="mt-2 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-950 outline-none transition-colors focus:border-blue-600 disabled:cursor-wait dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500"
                >
                  {aiEnhancementModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {t(model.messageName)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex min-h-9 items-center pb-0.5">
                {aiEnhancementModelStatusLabel && (
                  <span
                    className={`text-xs font-medium ${getStatusClass(aiEnhancementModelState)}`}
                  >
                    {aiEnhancementModelStatusLabel}
                  </span>
                )}
              </div>
            </div>

          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
              {t('popupCurrentSite')}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-500">
              {hostname || t('popupSiteUnavailable')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {siteStatusLabel && (
              <span
                className={`text-xs font-medium ${getStatusClass(siteState)}`}
              >
                {siteStatusLabel}
              </span>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={isSiteEnabled}
              aria-label={isSiteEnabled ? t('popupSiteEnabled') : t('popupSiteDisabled')}
              disabled={!hostname || siteState === 'saving'}
              onClick={() => {
                void onSiteEnabledChange(!isSiteEnabled)
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-blue-500 dark:focus:ring-offset-zinc-900 ${
                isSiteEnabled
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  isSiteEnabled ? 'translate-x-5' : 'translate-x-0'
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
