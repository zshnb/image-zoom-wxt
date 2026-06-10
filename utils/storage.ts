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

export const imageEnhancementEnabled = storage.defineItem<boolean>(
  'local:imageEnhancementEnabled',
  {
    fallback: true,
  },
)

export function isTriggerShortcutCode(value: unknown): value is TriggerShortcutCode {
  return triggerShortcuts.some((shortcut) => shortcut.code === value)
}
