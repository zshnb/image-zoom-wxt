import type { AiEnhancementModel } from '@/utils/storage'

export type RealEsrganBackend = 'webgpu' | 'wasm'
export type RealEsrganDtype = 'float32' | 'uint8'
export type RealEsrganModelResource =
  | '/models/real_esrgan_general_x4v3.tflite'
  | '/models/real_esrgan_x4plus_w8a8.tflite'

export type RealEsrganModelConfig = Readonly<{
  url: RealEsrganModelResource
  inputSize: number
  outputSize: number
  padding: number
  tileContentSize: number
  dtype: RealEsrganDtype
  maxTiles: number
  maxWasmTiles: number
  requiresJspi: boolean
  allowWasm: boolean
}>

export const REAL_ESRGAN_MODEL_CONFIGS = {
  'general-x4v3': {
    url: '/models/real_esrgan_general_x4v3.tflite',
    inputSize: 128,
    outputSize: 512,
    padding: 16,
    tileContentSize: 96,
    dtype: 'float32',
    maxTiles: 256,
    maxWasmTiles: 100,
    requiresJspi: false,
    allowWasm: true,
  },
  x4plus: {
    url: '/models/real_esrgan_x4plus_w8a8.tflite',
    inputSize: 128,
    outputSize: 512,
    padding: 16,
    tileContentSize: 96,
    dtype: 'uint8',
    maxTiles: 256,
    maxWasmTiles: 0,
    requiresJspi: true,
    allowWasm: false,
  },
} as const satisfies Readonly<Record<AiEnhancementModel, RealEsrganModelConfig>>

export const REAL_ESRGAN_MODELS = REAL_ESRGAN_MODEL_CONFIGS

export function getRealEsrganModelConfig(
  model: AiEnhancementModel,
): RealEsrganModelConfig {
  return REAL_ESRGAN_MODEL_CONFIGS[model]
}

export function assertTileBudget(
  model: AiEnhancementModel,
  backend: RealEsrganBackend,
  tileCount: number,
): void {
  if (!Number.isInteger(tileCount) || tileCount < 1) {
    throw new Error('Real-ESRGAN tile count must be a positive integer')
  }

  const config = getRealEsrganModelConfig(model)
  const maxTiles = backend === 'wasm' ? config.maxWasmTiles : config.maxTiles
  if (tileCount > maxTiles) {
    throw new Error(
      `Real-ESRGAN ${model} ${backend} tile limit exceeded: ${tileCount} > ${maxTiles}`,
    )
  }
}

export function runWithTileBudget<T>(
  model: AiEnhancementModel,
  backend: RealEsrganBackend,
  tileCount: number,
  run: () => T,
): T {
  assertTileBudget(model, backend, tileCount)
  return run()
}
