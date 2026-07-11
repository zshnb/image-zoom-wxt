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

export const aiEnhancementModels = [
  { value: 'general-x4v3', messageName: 'aiModelGeneralX4v3' },
  { value: 'x4plus', messageName: 'aiModelX4plus' },
] as const

export type AiEnhancementModel = (typeof aiEnhancementModels)[number]['value']

export const DEFAULT_AI_ENHANCEMENT_MODEL: AiEnhancementModel = 'general-x4v3'

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

export const aiEnhancementModel = storage.defineItem<AiEnhancementModel>(
  'local:aiEnhancementModel',
  {
    fallback: DEFAULT_AI_ENHANCEMENT_MODEL,
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

export function isAiEnhancementModel(value: unknown): value is AiEnhancementModel {
  return aiEnhancementModels.some((model) => model.value === value)
}

export function resolveAiEnhancementModel(value: unknown): AiEnhancementModel {
  return isAiEnhancementModel(value) ? value : DEFAULT_AI_ENHANCEMENT_MODEL
}

export function isTriggerShortcutCode(value: unknown): value is TriggerShortcutCode {
  return triggerShortcuts.some((shortcut) => shortcut.code === value)
}
