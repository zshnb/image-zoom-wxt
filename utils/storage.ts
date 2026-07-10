import { storage } from 'wxt/utils/storage'

export const disabledSites = storage.defineItem<string[]>('local:disabledSites', {
  fallback: [],
})

export const triggerShortcuts = [
  { code: 'ShiftLeft', messageName: 'shortcutShiftLeft' },
  { code: 'ShiftRight', messageName: 'shortcutShiftRight' },
  { code: 'AltLeft', messageName: 'shortcutAltLeft' },
  { code: 'AltRight', messageName: 'shortcutAltRight' },
  { code: 'ControlLeft', messageName: 'shortcutControlLeft' },
  { code: 'ControlRight', messageName: 'shortcutControlRight' },
  { code: 'MetaLeft', messageName: 'shortcutMetaLeft' },
  { code: 'MetaRight', messageName: 'shortcutMetaRight' },
] as const

export type TriggerShortcutCode = (typeof triggerShortcuts)[number]['code']

export const DEFAULT_TRIGGER_SHORTCUT: TriggerShortcutCode = 'ShiftLeft'

export const triggerShortcut = storage.defineItem<TriggerShortcutCode>('local:triggerShortcut', {
  fallback: DEFAULT_TRIGGER_SHORTCUT,
})

export const imageEnhancementModes = [
  { value: 'ai', messageName: 'enhancementModeAi' },
  { value: 'lanczos', messageName: 'enhancementModeLanczos' },
  { value: 'off', messageName: 'enhancementModeOff' },
] as const

export type ImageEnhancementMode = (typeof imageEnhancementModes)[number]['value']

export const DEFAULT_AI_ENHANCEMENT_STRENGTH = 50

export const imageEnhancementEnabled = storage.defineItem<boolean>(
  'local:imageEnhancementEnabled',
  {
    fallback: true,
  },
)

export const imageEnhancementMode = storage.defineItem<ImageEnhancementMode | null>(
  'local:imageEnhancementMode',
  {
    fallback: null,
  },
)

export const aiEnhancementStrength = storage.defineItem<number>(
  'local:aiEnhancementStrength',
  {
    fallback: DEFAULT_AI_ENHANCEMENT_STRENGTH,
  },
)

export function isImageEnhancementMode(value: unknown): value is ImageEnhancementMode {
  return imageEnhancementModes.some((mode) => mode.value === value)
}

export function resolveImageEnhancementMode(
  mode: unknown,
  legacyEnabled: unknown,
): ImageEnhancementMode {
  if (isImageEnhancementMode(mode)) return mode
  return legacyEnabled === false ? 'off' : 'ai'
}

export function resolveAiEnhancementStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_AI_ENHANCEMENT_STRENGTH
  }
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function isTriggerShortcutCode(value: unknown): value is TriggerShortcutCode {
  return triggerShortcuts.some((shortcut) => shortcut.code === value)
}
