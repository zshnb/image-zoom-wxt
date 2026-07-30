import {
  isAiEnhancementModel,
  type AiEnhancementModel,
} from './storage'

export const NATIVE_ESRGAN_HOST_NAME = 'com.image_zoom.esrgan'

export type NativeEsrganUpscaleMessage = {
  type: 'NATIVE_ESRGAN_UPSCALE'
  requestId: string
  imageBase64: string
  model: AiEnhancementModel
}

export type CancelNativeEsrganMessage = {
  type: 'CANCEL_NATIVE_ESRGAN'
  requestId: string
}

export type NativeEsrganResponse =
  | { ok: true; dataBase64: string; mimeType: string }
  | { ok: false; error: string }

export type NativeEsrganHostResponse =
  | { type: 'chunk'; index: number; data: string }
  | { type: 'complete'; mimeType: string }
  | { type: 'error'; error: string }

export function isNativeEsrganUpscaleMessage(
  value: unknown,
): value is NativeEsrganUpscaleMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.type === 'NATIVE_ESRGAN_UPSCALE'
    && typeof candidate.requestId === 'string'
    && typeof candidate.imageBase64 === 'string'
    && isAiEnhancementModel(candidate.model)
  )
}

export function isCancelNativeEsrganMessage(
  value: unknown,
): value is CancelNativeEsrganMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.type === 'CANCEL_NATIVE_ESRGAN'
    && typeof candidate.requestId === 'string'
  )
}

export function isNativeEsrganHostResponse(
  value: unknown,
): value is NativeEsrganHostResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.type === 'chunk') {
    return (
      Number.isSafeInteger(candidate.index)
      && (candidate.index as number) >= 0
      && typeof candidate.data === 'string'
    )
  }
  if (candidate.type === 'complete') return candidate.mimeType === 'image/png'
  return candidate.type === 'error' && typeof candidate.error === 'string'
}
