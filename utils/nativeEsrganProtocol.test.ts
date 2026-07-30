import { describe, expect, it } from 'vitest'
import {
  isNativeEsrganHostResponse,
  isNativeEsrganUpscaleMessage,
} from './nativeEsrganProtocol'

describe('native ESRGAN protocol', () => {
  it('accepts supported requests and ordered response shapes', () => {
    expect(isNativeEsrganUpscaleMessage({
      type: 'NATIVE_ESRGAN_UPSCALE',
      requestId: 'request-1',
      imageBase64: 'aGVsbG8=',
      model: 'general-x4v3',
    })).toBe(true)
    expect(isNativeEsrganHostResponse({
      type: 'chunk',
      index: 0,
      data: 'aGVsbG8=',
    })).toBe(true)
    expect(isNativeEsrganHostResponse({
      type: 'complete',
      mimeType: 'image/png',
    })).toBe(true)
  })

  it('rejects unsupported models and malformed host messages', () => {
    expect(isNativeEsrganUpscaleMessage({
      type: 'NATIVE_ESRGAN_UPSCALE',
      requestId: 'request-1',
      imageBase64: 'aGVsbG8=',
      model: 'unknown',
    })).toBe(false)
    expect(isNativeEsrganHostResponse({
      type: 'chunk',
      index: -1,
      data: '',
    })).toBe(false)
  })
})
