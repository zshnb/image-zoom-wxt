import {
  Tensor,
  isWebGPUSupported,
  loadAndCompile,
  loadLiteRt,
  supportsFeature,
  unloadLiteRt,
  type Accelerator,
  type CompiledModel,
} from '@litertjs/core'
import type { AiEnhancementModel } from '@/utils/storage'

type LogContext = { sessionId: string; requestId?: number }
type LogData = Record<string, unknown>
type ModelDtype = 'float32' | 'uint8'
type ModelInput = Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>
type RuntimeState = { jspi: boolean }
type ModelConfig = {
  url:
    | '/models/real_esrgan_general_x4v3.tflite'
    | '/models/real_esrgan_x4plus_w8a8.tflite'
  inputSize: number
  outputSize: number
  dtype: ModelDtype
  requiresJspi: boolean
  allowWasm: boolean
}
type ModelState = {
  backend: Accelerator
  modelName: AiEnhancementModel
  model: CompiledModel
}
type RunTileRequest = {
  type: 'RUN_TILE'
  id: number
  input: ModelInput
  model: AiEnhancementModel
  context: LogContext
  tile: LogData
}
type CancelRequest = { type: 'CANCEL_TILE'; id: number }
type DisposeRequest = { type: 'DISPOSE' }
type RunnerRequest = RunTileRequest | CancelRequest | DisposeRequest

const MODEL_CONFIGS: Record<AiEnhancementModel, ModelConfig> = {
  'general-x4v3': {
    url: '/models/real_esrgan_general_x4v3.tflite',
    inputSize: 128,
    outputSize: 512,
    dtype: 'float32',
    requiresJspi: false,
    allowWasm: true,
  },
  x4plus: {
    url: '/models/real_esrgan_x4plus_w8a8.tflite',
    inputSize: 128,
    outputSize: 512,
    dtype: 'uint8',
    requiresJspi: true,
    allowWasm: false,
  },
}
const LOG_PREFIX = '[ImageZoom][enhancement]'

let runtimePromise: Promise<RuntimeState> | null = null
let modelPromise: Promise<ModelState> | null = null
let compilingModel: AiEnhancementModel | null = null
let modelState: ModelState | null = null
const forceWasmModels = new Set<AiEnhancementModel>()

function errorData(error: unknown): LogData {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message }
  }
  return { errorMessage: String(error) }
}

function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  context: LogContext,
  data: LogData = {},
): void {
  console[level](`${LOG_PREFIX} ${event}`, {
    scope: 'image-zoom',
    component: 'litert-runner',
    event,
    timestamp: new Date().toISOString(),
    ...context,
    ...data,
  })
}

function hasJspiApis(): boolean {
  const wasm = WebAssembly as typeof WebAssembly & {
    Suspending?: unknown
    promising?: unknown
  }
  return typeof wasm.Suspending === 'function' && typeof wasm.promising === 'function'
}

async function ensureRuntime(context: LogContext): Promise<RuntimeState> {
  if (runtimePromise) return runtimePromise

  const startedAt = performance.now()
  runtimePromise = Promise.all([
    supportsFeature('jspi'),
    supportsFeature('relaxedSimd'),
  ]).then(async ([jspiFeature, relaxedSimd]) => {
    const jspi = jspiFeature && hasJspiApis()
    if (jspi) {
      const wasmUrl = browser.runtime.getURL(
        '/litert/wasm/litert_wasm_jspi_internal.js',
      )
      log('info', 'runtime_load_start', context, { jspi, relaxedSimd, wasmUrl })
      await loadLiteRt(wasmUrl)
    } else {
      const wasmPath = relaxedSimd
        ? '/litert/wasm/litert_wasm_internal.js' as const
        : '/litert/wasm/litert_wasm_compat_internal.js' as const
      const wasmUrl = browser.runtime.getURL(wasmPath)
      log('info', 'runtime_load_start', context, { jspi, relaxedSimd, wasmUrl })
      await loadLiteRt(wasmUrl)
    }
    return { jspi }
  }).then((state) => {
    log('info', 'runtime_load_complete', context, {
      jspi: state.jspi,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return state
  }).catch((error: unknown) => {
    runtimePromise = null
    log('error', 'runtime_load_failed', context, {
      durationMs: Math.round(performance.now() - startedAt),
      ...errorData(error),
    })
    throw error
  })

  return runtimePromise
}

async function loadModelBytes(
  modelName: AiEnhancementModel,
  context: LogContext,
): Promise<Uint8Array> {
  const startedAt = performance.now()
  const modelUrl = browser.runtime.getURL(MODEL_CONFIGS[modelName].url)
  log('info', 'model_fetch_start', context, { model: modelName, modelUrl })

  try {
    const response = await fetch(modelUrl)
    if (!response.ok) throw new Error(`Model request failed with HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    log('info', 'model_fetch_complete', context, {
      model: modelName,
      bytes: bytes.byteLength,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return bytes
  } catch (error) {
    log('error', 'model_fetch_failed', context, {
      model: modelName,
      ...errorData(error),
    })
    throw error
  }
}

function validateModel(model: CompiledModel, modelName: AiEnhancementModel): void {
  const config = MODEL_CONFIGS[modelName]
  const [input] = model.getInputDetails()
  const [output] = model.getOutputDetails()
  const inputShape = input ? Array.from(input.shape) : []
  const outputShape = output ? Array.from(output.shape) : []

  if (
    input?.dtype !== config.dtype
    || output?.dtype !== config.dtype
    || inputShape.join(',') !== `1,${config.inputSize},${config.inputSize},3`
    || outputShape.join(',') !== `1,${config.outputSize},${config.outputSize},3`
  ) {
    throw new Error(
      `Unexpected Real-ESRGAN tensors: input=${inputShape.join('x')} output=${outputShape.join('x')}`,
    )
  }
}

async function compileModel(
  backend: Accelerator,
  modelName: AiEnhancementModel,
  bytes: Uint8Array,
  context: LogContext,
): Promise<ModelState> {
  const startedAt = performance.now()
  const config = MODEL_CONFIGS[modelName]
  const runtime = await ensureRuntime(context)
  if (config.requiresJspi && !runtime.jspi) {
    throw new Error(`Real-ESRGAN ${modelName} requires LiteRT JSPI support`)
  }
  log('info', 'model_compile_start', context, {
    backend,
    model: modelName,
    dtype: config.dtype,
    jspi: runtime.jspi,
  })
  const model = await loadAndCompile(bytes, { accelerator: backend })

  try {
    validateModel(model, modelName)
    if (backend === 'webgpu' && !config.allowWasm && !model.isFullyAccelerated) {
      throw new Error(`Real-ESRGAN ${modelName} is not fully WebGPU accelerated`)
    }
  } catch (error) {
    model.delete()
    throw error
  }

  log('info', 'model_compile_complete', context, {
    backend,
    model: modelName,
    dtype: config.dtype,
    jspi: runtime.jspi,
    durationMs: Math.round(performance.now() - startedAt),
    fullyAccelerated: model.isFullyAccelerated,
    input: Array.from(model.getInputDetails()[0].shape),
    output: Array.from(model.getOutputDetails()[0].shape),
  })
  return { backend, modelName, model }
}

async function getModel(
  modelName: AiEnhancementModel,
  context: LogContext,
): Promise<ModelState> {
  if (modelState?.modelName === modelName) return modelState
  if (modelState) {
    log('info', 'model_switch', context, {
      from: modelState.modelName,
      to: modelName,
    })
    releaseModel(modelState)
  }
  if (modelPromise && compilingModel === modelName) return modelPromise

  compilingModel = modelName
  modelPromise = (async () => {
    const config = MODEL_CONFIGS[modelName]
    const runtime = await ensureRuntime(context)
    if (config.requiresJspi && !runtime.jspi) {
      throw new Error(`Real-ESRGAN ${modelName} requires LiteRT JSPI support`)
    }
    if (!config.allowWasm && !isWebGPUSupported()) {
      throw new Error(`Real-ESRGAN ${modelName} requires WebGPU`)
    }
    const bytes = await loadModelBytes(modelName, context)
    if (!forceWasmModels.has(modelName) && isWebGPUSupported()) {
      try {
        return await compileModel('webgpu', modelName, bytes, context)
      } catch (error) {
        if (!config.allowWasm) {
          log('warn', 'backend_unavailable', context, {
            model: modelName,
            backend: 'webgpu',
            fallback: 'disabled',
            reason: 'compile_failed',
            ...errorData(error),
          })
          throw error
        }
        forceWasmModels.add(modelName)
        log('warn', 'backend_fallback', context, {
          model: modelName,
          from: 'webgpu',
          to: 'wasm',
          reason: 'compile_failed',
          ...errorData(error),
        })
      }
    } else {
      log('info', 'backend_selected', context, {
        model: modelName,
        backend: 'wasm',
        reason: forceWasmModels.has(modelName)
          ? 'previous_webgpu_failure'
          : 'webgpu_unavailable',
      })
    }
    return compileModel('wasm', modelName, bytes, context)
  })().then((state) => {
    modelState = state
    modelPromise = null
    compilingModel = null
    return state
  }).catch((error: unknown) => {
    modelPromise = null
    compilingModel = null
    log('error', 'model_unavailable', context, {
      model: modelName,
      ...errorData(error),
    })
    throw error
  })

  return modelPromise
}

function releaseModel(state: ModelState): void {
  state.model.delete()
  if (modelState === state) modelState = null
  modelPromise = null
  compilingModel = null
}

function toRgba(
  output: Float32Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike>,
  config: ModelConfig,
): Uint8ClampedArray<ArrayBuffer> {
  const pixelCount = config.outputSize * config.outputSize
  if (output.length !== pixelCount * 3) {
    throw new Error(`Unexpected Real-ESRGAN output length: ${output.length}`)
  }

  const rgba = new Uint8ClampedArray(new ArrayBuffer(pixelCount * 4))
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * 3
    const targetOffset = pixel * 4
    if (config.dtype === 'uint8') {
      rgba[targetOffset] = output[sourceOffset]
      rgba[targetOffset + 1] = output[sourceOffset + 1]
      rgba[targetOffset + 2] = output[sourceOffset + 2]
    } else {
      rgba[targetOffset] = Math.round(Math.min(1, Math.max(0, output[sourceOffset])) * 255)
      rgba[targetOffset + 1] = Math.round(
        Math.min(1, Math.max(0, output[sourceOffset + 1])) * 255,
      )
      rgba[targetOffset + 2] = Math.round(
        Math.min(1, Math.max(0, output[sourceOffset + 2])) * 255,
      )
    }
    rgba[targetOffset + 3] = 255
  }
  return rgba
}

async function runWithModel(
  state: ModelState,
  request: RunTileRequest,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const startedAt = performance.now()
  const config = MODEL_CONFIGS[request.model]
  const inputTensor = new Tensor(
    request.input,
    [1, config.inputSize, config.inputSize, 3],
  )
  let outputs: Tensor[] = []
  log('debug', 'tile_inference_start', request.context, {
    backend: state.backend,
    model: request.model,
    ...request.tile,
  })

  try {
    outputs = await state.model.run(inputTensor)
    const output = await outputs[0].data()
    let rgba: Uint8ClampedArray<ArrayBuffer>
    if (config.dtype === 'uint8') {
      if (!(output instanceof Uint8Array)) {
        throw new Error(`Unexpected Real-ESRGAN output type: ${output.constructor.name}`)
      }
      rgba = toRgba(output, config)
    } else {
      if (!(output instanceof Float32Array)) {
        throw new Error(`Unexpected Real-ESRGAN output type: ${output.constructor.name}`)
      }
      rgba = toRgba(output, config)
    }
    log('debug', 'tile_inference_complete', request.context, {
      backend: state.backend,
      model: request.model,
      durationMs: Math.round(performance.now() - startedAt),
      ...request.tile,
    })
    return rgba
  } finally {
    inputTensor.delete()
    outputs.forEach((output) => output.delete())
  }
}

async function runTile(
  request: RunTileRequest,
): Promise<{ backend: Accelerator; rgba: Uint8ClampedArray<ArrayBuffer> }> {
  let state = await getModel(request.model, request.context)
  try {
    return { backend: state.backend, rgba: await runWithModel(state, request) }
  } catch (error) {
    if (state.backend !== 'webgpu') throw error
    if (!MODEL_CONFIGS[request.model].allowWasm) {
      log('warn', 'backend_fallback_skipped', request.context, {
        model: request.model,
        from: 'webgpu',
        reason: 'wasm_disabled',
        ...request.tile,
        ...errorData(error),
      })
      throw error
    }
    forceWasmModels.add(request.model)
    log('warn', 'backend_fallback', request.context, {
      model: request.model,
      from: 'webgpu',
      to: 'wasm',
      reason: 'inference_failed',
      ...request.tile,
      ...errorData(error),
    })
    releaseModel(state)
    state = await getModel(request.model, request.context)
    return { backend: state.backend, rgba: await runWithModel(state, request) }
  }
}

function dispose(context: LogContext): void {
  if (modelState) modelState.model.delete()
  modelState = null
  modelPromise = null
  compilingModel = null
  forceWasmModels.clear()
  if (runtimePromise) unloadLiteRt()
  runtimePromise = null
  log('info', 'runtime_disposed', context)
}

let connected = false
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (connected || event.source !== parent || event.ports.length !== 1) return
  if (
    typeof event.data !== 'object'
    || event.data === null
    || (event.data as Record<string, unknown>).type !== 'IMAGE_ZOOM_LITERT_CONNECT'
  ) return

  connected = true
  const port = event.ports[0]
  const canceled = new Set<number>()
  const queued = new Set<number>()
  let queue = Promise.resolve()
  port.start()
  port.postMessage({ type: 'READY' })

  port.addEventListener('message', (message: MessageEvent<RunnerRequest>) => {
    const request = message.data
    if (request.type === 'CANCEL_TILE') {
      if (queued.has(request.id)) canceled.add(request.id)
      return
    }

    if (request.type === 'RUN_TILE') queued.add(request.id)

    queue = queue.then(async () => {
      if (request.type === 'DISPOSE') {
        dispose({ sessionId: 'content-script' })
        canceled.clear()
        queued.clear()
        return
      }
      if (canceled.delete(request.id)) {
        queued.delete(request.id)
        return
      }

      try {
        const result = await runTile(request)
        if (canceled.delete(request.id)) return
        port.postMessage({
          type: 'RUN_TILE_RESULT',
          id: request.id,
          backend: result.backend,
          rgba: result.rgba.buffer,
        }, [result.rgba.buffer])
      } catch (error) {
        port.postMessage({
          type: 'RUN_TILE_ERROR',
          id: request.id,
          ...errorData(error),
        })
      } finally {
        canceled.delete(request.id)
        queued.delete(request.id)
      }
    }).catch((error: unknown) => {
      log('error', 'runner_queue_failed', { sessionId: 'content-script' }, errorData(error))
    })
  })
})
