import type { ImageEnhancementMode } from './storage'

export type AppliedEnhancementAlgorithm = 'ai' | 'lanczos' | null
export type EnhancementOutcomeMessageKey =
  | 'viewerAiEnhancementReady'
  | 'viewerAiEnhancementFallback'
  | 'viewerEnhancementFailed'

type EnhancementOutcome = {
  requestedMode: Exclude<ImageEnhancementMode, 'off'>
  appliedAlgorithm: AppliedEnhancementAlgorithm
  canceled?: boolean
  stale?: boolean
}

export function getEnhancementOutcomeMessageKey({
  requestedMode,
  appliedAlgorithm,
  canceled = false,
  stale = false,
}: EnhancementOutcome): EnhancementOutcomeMessageKey | null {
  if (canceled || stale) return null
  if (!appliedAlgorithm) return 'viewerEnhancementFailed'
  if (requestedMode === 'ai' && appliedAlgorithm === 'ai') {
    return 'viewerAiEnhancementReady'
  }
  if (requestedMode === 'ai' && appliedAlgorithm === 'lanczos') {
    return 'viewerAiEnhancementFallback'
  }
  return null
}
