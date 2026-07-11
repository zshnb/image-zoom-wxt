import { afterEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import {
  aiEnhancementModels,
  DEFAULT_AI_ENHANCEMENT_MODEL,
  imageEnhancementModes,
  isTriggerShortcutCode,
  resolveAiEnhancementModel,
  resolveImageEnhancementMode,
  triggerShortcut,
  triggerShortcuts,
} from './storage'

afterEach(() => {
  fakeBrowser.reset()
})

describe('trigger shortcuts', () => {
  it('accepts every configured shortcut code', () => {
    for (const shortcut of triggerShortcuts) {
      expect(isTriggerShortcutCode(shortcut.code)).toBe(true)
    }
  })

  it.each(['Shift', 'KeyA', '', null, undefined, 1, {}])(
    'rejects an unrelated value: %s',
    (value) => {
      expect(isTriggerShortcutCode(value)).toBe(false)
    },
  )

  it('round-trips a shortcut through extension storage', async () => {
    await triggerShortcut.setValue('AltRight')

    await expect(triggerShortcut.getValue()).resolves.toBe('AltRight')
  })
})

describe('image enhancement mode resolution', () => {
  it.each(imageEnhancementModes.map(({ value }) => value))(
    'keeps the valid mode %s',
    (mode) => {
      expect(resolveImageEnhancementMode(mode, false)).toBe(mode)
    },
  )

  it('maps a disabled legacy setting to off', () => {
    expect(resolveImageEnhancementMode(undefined, false)).toBe('off')
  })

  it.each([undefined, null, true, 'invalid', {}])(
    'defaults missing or invalid legacy state to ai: %s',
    (legacyEnabled) => {
      expect(resolveImageEnhancementMode('invalid', legacyEnabled)).toBe('ai')
    },
  )
})

describe('AI enhancement model resolution', () => {
  it.each(aiEnhancementModels.map(({ value }) => value))(
    'keeps the valid model %s',
    (model) => {
      expect(resolveAiEnhancementModel(model)).toBe(model)
    },
  )

  it.each([undefined, null, false, 'invalid', {}])(
    'uses the default for an invalid model: %s',
    (model) => {
      expect(resolveAiEnhancementModel(model)).toBe(DEFAULT_AI_ENHANCEMENT_MODEL)
    },
  )
})
