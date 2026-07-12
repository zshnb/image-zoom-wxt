import { describe, expect, it, vi } from 'vitest'
import { clearUpscaleCache, createUpscaleCacheKey } from './upscaleCache'

const baseKey = {
  sourceGeneration: 1,
  mode: 'ai' as const,
  aiModel: 'general-x4v3' as const,
  width: 800,
  height: 600,
}

describe('upscale cache key', () => {
  it('is stable for the same source and enhancement parameters', () => {
    expect(createUpscaleCacheKey(baseKey)).toBe(createUpscaleCacheKey(baseKey))
  })

  it('separates different source generations with identical parameters', () => {
    expect(createUpscaleCacheKey(baseKey)).not.toBe(createUpscaleCacheKey({
      ...baseKey,
      sourceGeneration: 2,
    }))
  })

  it.each([
    { mode: 'lanczos' as const },
    { aiModel: 'x4plus' as const },
    { width: 801 },
    { height: 601 },
  ])('separates a changed enhancement parameter: %o', (change) => {
    expect(createUpscaleCacheKey(baseKey)).not.toBe(createUpscaleCacheKey({
      ...baseKey,
      ...change,
    }))
  })
})

describe('upscale cache cleanup', () => {
  it('revokes every cached URL once and empties the cache', () => {
    const cache = new Map([
      ['first', 'blob:first'],
      ['second', 'blob:second'],
    ])
    const revokeObjectUrl = vi.fn()

    clearUpscaleCache(cache, revokeObjectUrl)

    expect(revokeObjectUrl).toHaveBeenCalledTimes(2)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first')
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:second')
    expect(cache.size).toBe(0)
  })
})
