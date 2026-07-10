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

type LogContext = { sessionId: string; requestId?: number }
type LogData = Record<string, unknown>
type ModelState = { backend: Accelerator; model: CompiledModel }
type RunTileRequest = {
  type: 'RUN_TILE'
  id: number
  input: Float32Array
  context: LogContext
  tile: LogData
}
type CancelRequest = { type: 'CANCEL_TILE'; id: number }
type DisposeRequest = { type: 'DISPOSE' }
type RunnerRequest = RunTileRequest | CancelRequest | DisposeRequest

const INPUT_SIZE = 128
const OUTPUT_SIZE = 512
const LOG_PREFIX = '[ImageZoom][enhancement]'

let runtimePromise: Promise<void> | null = null
let modelBytesPromise: Promise<Uint8Array> | null = null
let modelPromise: Promise<ModelState> | null = null
let modelState: ModelState | null = null
let forceWasm = false

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

async function ensureRuntime(context: LogContext): Promise<void> {
  if (runtimePromise) return runtimePromise

  const startedAt = performance.now()
  runtimePromise = supportsFeature('relaxedSimd').then(async (relaxedSimd) => {
    const wasmPath = relaxedSimd
      ? '/litert/wasm/litert_wasm_internal.js' as const
      : '/litert/wasm/litert_wasm_compat_internal.js' as const
    const wasmUrl = browser.runtime.getURL(wasmPath)
    log('info', 'runtime_load_start', context, { relaxedSimd, wasmUrl })
    await loadLiteRt(wasmUrl)
  }).then(() => {
    log('info', 'runtime_load_complete', context, {
      durationMs: Math.round(performance.now() - startedAt),
    })
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

async function loadModelBytes(context: LogContext): Promise<Uint8Array> {
  if (modelBytesPromise) return modelBytesPromise

  const startedAt = performance.now()
  const modelUrl = browser.runtime.getURL('/models/real_esrgan_general_x4v3.tflite')
  log('info', 'model_fetch_start', context, { modelUrl })

  modelBytesPromise = fetch(modelUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Model request failed with HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    log('info', 'model_fetch_complete', context, {
      bytes: bytes.byteLength,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return bytes
  }).catch((error: unknown) => {
    modelBytesPromise = null
    log('error', 'model_fetch_failed', context, errorData(error))
    throw error
  })

  return modelBytesPromise
}

function validateModel(model: CompiledModel): void {
  const [input] = model.getInputDetails()
  const [output] = model.getOutputDetails()
  const inputShape = input ? Array.from(input.shape) : []
  const outputShape = output ? Array.from(output.shape) : []

  if (
    input?.dtype !== 'float32'
    || output?.dtype !== 'float32'
    || inputShape.join(',') !== '1,128,128,3'
    || outputShape.join(',') !== '1,512,512,3'
  ) {
    throw new Error(
      `Unexpected Real-ESRGAN tensors: input=${inputShape.join('x')} output=${outputShape.join('x')}`,
    )
  }
}

async function compileModel(backend: Accelerator, context: LogContext): Promise<ModelState> {
  const startedAt = performance.now()
  log('info', 'model_compile_start', context, { backend })
  const [, bytes] = await Promise.all([ensureRuntime(context), loadModelBytes(context)])
  const model = await loadAndCompile(bytes, { accelerator: backend })

  try {
    validateModel(model)
  } catch (error) {
    model.delete()
    throw error
  }

  log('info', 'model_compile_complete', context, {
    backend,
    durationMs: Math.round(performance.now() - startedAt),
    fullyAccelerated: model.isFullyAccelerated,
    input: Array.from(model.getInputDetails()[0].shape),
    output: Array.from(model.getOutputDetails()[0].shape),
  })
  return { backend, model }
}

async function getModel(context: LogContext): Promise<ModelState> {
  if (modelState) return modelState
  if (modelPromise) return modelPromise

  modelPromise = (async () => {
    if (!forceWasm && isWebGPUSupported()) {
      try {
        return await compileModel('webgpu', context)
      } catch (error) {
        forceWasm = true
        log('warn', 'backend_fallback', context, {
          from: 'webgpu',
          to: 'wasm',
          reason: 'compile_failed',
          ...errorData(error),
        })
      }
    } else {
      log('info', 'backend_selected', context, {
        backend: 'wasm',
        reason: forceWasm ? 'previous_webgpu_failure' : 'webgpu_unavailable',
      })
    }
    return compileModel('wasm', context)
  })().then((state) => {
    modelState = state
    return state
  }).catch((error: unknown) => {
    modelPromise = null
    log('error', 'model_unavailable', context, errorData(error))
    throw error
  })

  return modelPromise
}

function releaseModel(state: ModelState): void {
  state.model.delete()
  if (modelState === state) modelState = null
  modelPromise = null
}

function toRgba(output: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const pixelCount = OUTPUT_SIZE * OUTPUT_SIZE
  if (output.length !== pixelCount * 3) {
    throw new Error(`Unexpected Real-ESRGAN output length: ${output.length}`)
  }

  const rgba = new Uint8ClampedArray(new ArrayBuffer(pixelCount * 4))
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * 3
    const targetOffset = pixel * 4
    rgba[targetOffset] = Math.round(Math.min(1, Math.max(0, output[sourceOffset])) * 255)
    rgba[targetOffset + 1] = Math.round(
      Math.min(1, Math.max(0, output[sourceOffset + 1])) * 255,
    )
    rgba[targetOffset + 2] = Math.round(
      Math.min(1, Math.max(0, output[sourceOffset + 2])) * 255,
    )
    rgba[targetOffset + 3] = 255
  }
  return rgba
}

async function runWithModel(
  state: ModelState,
  request: RunTileRequest,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const startedAt = performance.now()
  const inputTensor = new Tensor(request.input, [1, INPUT_SIZE, INPUT_SIZE, 3])
  let outputs: Tensor[] = []
  log('debug', 'tile_inference_start', request.context, {
    backend: state.backend,
    ...request.tile,
  })

  try {
    outputs = await state.model.run(inputTensor)
    const output = await outputs[0].data()
    if (!(output instanceof Float32Array)) {
      throw new Error(`Unexpected Real-ESRGAN output type: ${output.constructor.name}`)
    }
    const rgba = toRgba(output)
    log('debug', 'tile_inference_complete', request.context, {
      backend: state.backend,
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
  let state = await getModel(request.context)
  try {
    return { backend: state.backend, rgba: await runWithModel(state, request) }
  } catch (error) {
    if (state.backend !== 'webgpu') throw error
    forceWasm = true
    log('warn', 'backend_fallback', request.context, {
      from: 'webgpu',
      to: 'wasm',
      reason: 'inference_failed',
      ...request.tile,
      ...errorData(error),
    })
    releaseModel(state)
    state = await getModel(request.context)
    return { backend: state.backend, rgba: await runWithModel(state, request) }
  }
}

function dispose(context: LogContext): void {
  if (modelState) modelState.model.delete()
  modelState = null
  modelPromise = null
  modelBytesPromise = null
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
  let queue = Promise.resolve()
  port.start()
  port.postMessage({ type: 'READY' })

  port.addEventListener('message', (message: MessageEvent<RunnerRequest>) => {
    const request = message.data
    if (request.type === 'CANCEL_TILE') {
      canceled.add(request.id)
      return
    }

    queue = queue.then(async () => {
      if (request.type === 'DISPOSE') {
        dispose({ sessionId: 'content-script' })
        return
      }
      if (canceled.delete(request.id)) return

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
      }
    }).catch((error: unknown) => {
      log('error', 'runner_queue_failed', { sessionId: 'content-script' }, errorData(error))
    })
  })
})
