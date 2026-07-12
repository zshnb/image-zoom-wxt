import type { AiEnhancementModel, ImageEnhancementMode } from './storage'

type UpscaleCacheKeyInput = {
  sourceGeneration: number
  mode: Exclude<ImageEnhancementMode, 'off'>
  aiModel: AiEnhancementModel
  width: number
  height: number
}

export function createUpscaleCacheKey({
  sourceGeneration,
  mode,
  aiModel,
  width,
  height,
}: UpscaleCacheKeyInput): string {
  return `${sourceGeneration}:${mode}:${mode === 'ai' ? aiModel : 'na'}:${width}x${height}`
}

export function clearUpscaleCache(
  cache: Map<string, string>,
  revokeObjectUrl: (url: string) => void = URL.revokeObjectURL,
): void {
  cache.forEach((objectUrl) => revokeObjectUrl(objectUrl))
  cache.clear()
}
