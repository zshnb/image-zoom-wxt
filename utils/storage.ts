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

export const aiEnhancementTriggers = [
  { value: 'open', messageName: 'aiTriggerOpen' },
  { value: 'zoom', messageName: 'aiTriggerZoom' },
] as const

export type AiEnhancementTrigger = (typeof aiEnhancementTriggers)[number]['value']

export const DEFAULT_AI_ENHANCEMENT_TRIGGER: AiEnhancementTrigger = 'zoom'
export const AI_MAX_INPUT_MEGAPIXELS_OPTIONS = [
  { value: 0.5, messageName: 'aiMaxInputSmall' },
  { value: 1, messageName: 'aiMaxInputHd' },
  { value: 2.1, messageName: 'aiMaxInputFullHd' },
  { value: 3.7, messageName: 'aiMaxInput2k' },
  { value: 6, messageName: 'aiMaxInputLarge' },
] as const
export type AiMaxInputMegapixels =
  (typeof AI_MAX_INPUT_MEGAPIXELS_OPTIONS)[number]['value']
export const DEFAULT_AI_MAX_INPUT_MEGAPIXELS: AiMaxInputMegapixels = 2.1

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

export const aiEnhancementTrigger = storage.defineItem<AiEnhancementTrigger>(
  'local:aiEnhancementTrigger',
  { fallback: DEFAULT_AI_ENHANCEMENT_TRIGGER },
)

export const aiMaxInputMegapixels = storage.defineItem<AiMaxInputMegapixels>(
  'local:aiMaxInputMegapixels',
  { fallback: DEFAULT_AI_MAX_INPUT_MEGAPIXELS },
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

export function isAiEnhancementTrigger(value: unknown): value is AiEnhancementTrigger {
  return aiEnhancementTriggers.some((trigger) => trigger.value === value)
}

export function resolveAiEnhancementTrigger(value: unknown): AiEnhancementTrigger {
  return isAiEnhancementTrigger(value) ? value : DEFAULT_AI_ENHANCEMENT_TRIGGER
}

export function isAiMaxInputMegapixels(value: unknown): value is AiMaxInputMegapixels {
  return AI_MAX_INPUT_MEGAPIXELS_OPTIONS.some((option) => option.value === value)
}

export function resolveAiMaxInputMegapixels(value: unknown): AiMaxInputMegapixels {
  return isAiMaxInputMegapixels(value) ? value : DEFAULT_AI_MAX_INPUT_MEGAPIXELS
}

export function isAiInputWithinLimit(
  width: number,
  height: number,
  maxMegapixels: AiMaxInputMegapixels,
): boolean {
  return width > 0 && height > 0 && width * height <= maxMegapixels * 1_000_000
}

export function isTriggerShortcutCode(value: unknown): value is TriggerShortcutCode {
  return triggerShortcuts.some((shortcut) => shortcut.code === value)
}
