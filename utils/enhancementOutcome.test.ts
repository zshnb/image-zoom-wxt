import { describe, expect, it } from 'vitest'
import { getEnhancementOutcomeMessageKey } from './enhancementOutcome'

describe('enhancement outcome message', () => {
  it('reports a successful AI result', () => {
    expect(getEnhancementOutcomeMessageKey({
      requestedMode: 'ai',
      appliedAlgorithm: 'ai',
    })).toBe('viewerAiEnhancementReady')
  })

  it('reports an AI fallback to Lanczos', () => {
    expect(getEnhancementOutcomeMessageKey({
      requestedMode: 'ai',
      appliedAlgorithm: 'lanczos',
    })).toBe('viewerAiEnhancementFallback')
  })

  it('does not add noise for explicit Lanczos success', () => {
    expect(getEnhancementOutcomeMessageKey({
      requestedMode: 'lanczos',
      appliedAlgorithm: 'lanczos',
    })).toBeNull()
  })

  it('reports total enhancement failure', () => {
    expect(getEnhancementOutcomeMessageKey({
      requestedMode: 'ai',
      appliedAlgorithm: null,
    })).toBe('viewerEnhancementFailed')
  })

  it.each([
    { canceled: true },
    { stale: true },
  ])('suppresses canceled and stale outcomes: %o', (state) => {
    expect(getEnhancementOutcomeMessageKey({
      requestedMode: 'ai',
      appliedAlgorithm: 'lanczos',
      ...state,
    })).toBeNull()
  })
})
