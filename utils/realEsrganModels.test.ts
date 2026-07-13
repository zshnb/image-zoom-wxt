import { describe, expect, it } from 'vitest'
import {
  assertTileBudget,
  REAL_ESRGAN_MODEL_CONFIGS,
  runWithTileBudget,
} from './realEsrganModels'

describe('Real-ESRGAN model metadata', () => {
  it('keeps the current model shapes, preprocessing, and backend limits', () => {
    expect(REAL_ESRGAN_MODEL_CONFIGS).toEqual({
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
    })
  })
})

describe('assertTileBudget', () => {
  it('accepts general-x4v3 WASM jobs through one hundred tiles', () => {
    expect(() => assertTileBudget('general-x4v3', 'wasm', 100)).not.toThrow()
  })

  it('rejects general-x4v3 WASM jobs above one hundred tiles', () => {
    expect(() => assertTileBudget('general-x4v3', 'wasm', 101)).toThrow(
      'Real-ESRGAN general-x4v3 wasm tile limit exceeded: 101 > 100',
    )
  })

  it('rejects x4plus on WASM', () => {
    expect(() => assertTileBudget('x4plus', 'wasm', 1)).toThrow(
      'Real-ESRGAN x4plus wasm tile limit exceeded: 1 > 0',
    )
  })

  it('keeps the global WebGPU limit at two hundred fifty-six tiles', () => {
    expect(() => assertTileBudget('general-x4v3', 'webgpu', 256)).not.toThrow()
    expect(() => assertTileBudget('general-x4v3', 'webgpu', 257)).toThrow(
      'Real-ESRGAN general-x4v3 webgpu tile limit exceeded: 257 > 256',
    )
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid tile count %s',
    (tileCount) => {
      expect(() => assertTileBudget('general-x4v3', 'wasm', tileCount)).toThrow(
        'Real-ESRGAN tile count must be a positive integer',
      )
    },
  )

  it('rechecks the WASM budget before a fallback callback', () => {
    const callbacks: string[] = []
    expect(() => runWithTileBudget(
      'general-x4v3',
      'webgpu',
      10,
      () => {
        callbacks.push('webgpu')
        throw new Error('webgpu inference failed')
      },
    )).toThrow('webgpu inference failed')

    expect(() => runWithTileBudget(
      'general-x4v3',
      'wasm',
      101,
      () => callbacks.push('wasm'),
    )).toThrow('Real-ESRGAN general-x4v3 wasm tile limit exceeded: 101 > 100')
    expect(callbacks).toEqual(['webgpu'])
  })

  it('keeps over-budget errors bounded and free of model bytes and source URLs', () => {
    let message = ''
    try {
      assertTileBudget('general-x4v3', 'wasm', 101)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message.length).toBeLessThan(200)
    expect(message).not.toContain('.tflite')
    expect(message).not.toContain('bytes')
    expect(message).not.toContain('http')
  })
})
