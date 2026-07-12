import type { AiEnhancementModel } from '@/utils/storage'
import { cleanupRunnerResources, waitForRunnerFrame } from '@/utils/runnerLifecycle'
import { getRealEsrganModelConfig } from '@/utils/realEsrganModels'

export type EnhancementLogContext = {
  sessionId: string
  requestId?: number
}

type Accelerator = 'webgpu' | 'wasm'
type EnhancementLogLevel = 'debug' | 'info' | 'warn' | 'error'
type EnhancementLogData = Record<string, unknown>
type ModelInput = Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>
type TileResult = {
  backend: Accelerator
  rgba: Uint8ClampedArray<ArrayBuffer>
}
type RunnerResponse =
  | { type: 'READY' }
  | { type: 'RUN_TILE_RESULT'; id: number; backend: Accelerator; rgba: ArrayBuffer }
  | { type: 'RUN_TILE_ERROR'; id: number; errorName?: string; errorMessage: string }
type PendingRequest = {
  resolve: (result: TileResult) => void
  reject: (error: Error) => void
  cleanup: () => void
}
export type RunnerClient = {
  iframe: HTMLIFrameElement
  port: MessagePort
  pending: Map<number, PendingRequest>
  nextId: number
  invalidated: boolean
  cleanup: (error: Error) => void
}

const RUNNER_TIMEOUT_MS = 120_000
const LOG_PREFIX = '[ImageZoom][enhancement]'

let runnerPromise: Promise<RunnerClient> | null = null
let activeRunner: RunnerClient | null = null

function createAbortError(): DOMException {
  return new DOMException('Image enhancement canceled', 'AbortError')
}

export function invalidateRunner(runner: RunnerClient, error: Error): void {
  if (runner.invalidated) return
  runner.invalidated = true
  if (activeRunner === runner) {
    activeRunner = null
    runnerPromise = null
  }
  runner.cleanup(error)
}

function errorDetails(error: unknown): EnhancementLogData {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message }
  }
  return { errorMessage: String(error) }
}

export function logImageEnhancement(
  level: EnhancementLogLevel,
  event: string,
  context: EnhancementLogContext,
  data: EnhancementLogData = {},
): void {
  console[level](`${LOG_PREFIX} ${event}`, {
    scope: 'image-zoom',
    component: 'image-enhancement',
    event,
    timestamp: new Date().toISOString(),
    ...context,
    ...data,
  })
}

export function isEnhancementAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Image enhancement canceled', 'AbortError')
}

async function createRunner(context: EnhancementLogContext): Promise<RunnerClient> {
  const startedAt = performance.now()
  const iframeUrl = browser.runtime.getURL('/litert-runner.html')
  const iframe = document.createElement('iframe')
  iframe.src = iframeUrl
  iframe.hidden = true
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')
  iframe.style.display = 'none'
  let iframeRemoved = false
  const removeIframe = (): void => {
    if (iframeRemoved) return
    iframeRemoved = true
    iframe.remove()
  }
  let channel: MessageChannel | null = null
  let pending: Map<number, PendingRequest> | null = null
  let readyTimeout: ReturnType<typeof setTimeout> | null = null
  let messageListener: ((event: MessageEvent<RunnerResponse>) => void) | null = null
  let messageErrorListener: (() => void) | null = null
  let createdRunner: RunnerClient | null = null
  const cleanupState = { cleaned: false }
  const clearRunnerTimers = (): void => {
    if (readyTimeout !== null) {
      clearTimeout(readyTimeout)
      readyTimeout = null
    }
  }
  const removeRunnerListeners = (): void => {
    if (!channel) return
    if (messageListener) channel.port1.removeEventListener('message', messageListener)
    if (messageErrorListener) {
      channel.port1.removeEventListener('messageerror', messageErrorListener)
    }
    messageListener = null
    messageErrorListener = null
  }

  logImageEnhancement('info', 'runner_create_start', context, { iframeUrl })
  try {
    await waitForRunnerFrame(
      iframe,
      (frame) => document.documentElement.appendChild(frame),
      10_000,
      removeIframe,
    )

    if (!iframe.contentWindow) {
      throw new Error('LiteRT runner window is unavailable')
    }

    const runnerChannel = new MessageChannel()
    channel = runnerChannel
    const runnerPending = new Map<number, PendingRequest>()
    pending = runnerPending
    let readyResolve: (() => void) | null = null
    let readyReject: ((error: Error) => void) | null = null
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve
      readyReject = reject
    })

    messageListener = (event: MessageEvent<RunnerResponse>): void => {
      if (cleanupState.cleaned) return
      const response = event.data
      if (response.type === 'READY') {
        readyResolve?.()
        return
      }

      const request = runnerPending.get(response.id)
      if (!request) return
      runnerPending.delete(response.id)
      request.cleanup()

      if (response.type === 'RUN_TILE_ERROR') {
        const error = new Error(response.errorMessage)
        if (response.errorName) error.name = response.errorName
        request.reject(error)
        return
      }

      request.resolve({
        backend: response.backend,
        rgba: new Uint8ClampedArray(response.rgba),
      })
    }
    messageErrorListener = (): void => {
      if (cleanupState.cleaned) return
      const error = new Error('LiteRT runner message could not be decoded')
      readyReject?.(error)
      if (createdRunner) {
        invalidateRunner(createdRunner, error)
      }
    }
    runnerChannel.port1.addEventListener('message', messageListener)
    runnerChannel.port1.addEventListener('messageerror', messageErrorListener)
    runnerChannel.port1.start()
    iframe.contentWindow.postMessage(
      { type: 'IMAGE_ZOOM_LITERT_CONNECT' },
      new URL(iframeUrl).origin,
      [runnerChannel.port2],
    )

    readyTimeout = setTimeout(() => {
      readyReject?.(new Error('LiteRT runner handshake timed out'))
    }, 10_000)

    await ready

    logImageEnhancement('info', 'runner_ready', context, {
      durationMs: Math.round(performance.now() - startedAt),
    })
    createdRunner = {
      iframe,
      port: runnerChannel.port1,
      pending: runnerPending,
      nextId: 1,
      invalidated: false,
      cleanup: (error: Error): void => {
        cleanupRunnerResources({
          removeFrame: removeIframe,
          removeListeners: removeRunnerListeners,
          clearTimers: clearRunnerTimers,
          closePort: () => {
            runnerChannel.port1.close()
            runnerChannel.port2.close()
          },
          pending: runnerPending,
          cleanupState,
        }, error)
      },
    }
    return createdRunner
  } catch (error) {
    cleanupRunnerResources({
      removeFrame: removeIframe,
      removeListeners: removeRunnerListeners,
      clearTimers: clearRunnerTimers,
      closePort: channel
        ? () => {
            channel?.port1.close()
            channel?.port2.close()
          }
        : undefined,
      pending: pending ?? undefined,
      cleanupState,
    }, error instanceof Error ? error : new Error(String(error)))
    throw error
  } finally {
    clearRunnerTimers()
  }
}

async function getRunner(context: EnhancementLogContext): Promise<RunnerClient> {
  if (!runnerPromise) {
    const creating = createRunner(context)
    let trackedPromise: Promise<RunnerClient>
    trackedPromise = creating.catch((error: unknown) => {
      if (runnerPromise === trackedPromise) runnerPromise = null
      logImageEnhancement('error', 'runner_create_failed', context, errorDetails(error))
      throw error
    })
    runnerPromise = trackedPromise
  }
  return runnerPromise
}

async function runTile(
  input: ModelInput,
  model: AiEnhancementModel,
  context: EnhancementLogContext,
  tile: EnhancementLogData,
  tileCount: number,
  signal: AbortSignal,
): Promise<TileResult> {
  throwIfAborted(signal)
  const runner = await getRunner(context)
  activeRunner = runner
  if (signal.aborted) {
    const error = createAbortError()
    invalidateRunner(runner, error)
    throw error
  }
  const id = runner.nextId
  runner.nextId += 1

  return new Promise<TileResult>((resolve, reject) => {
    let settled = false
    let timeout: number | null = null
    let onAbort = (): void => undefined
    const cleanup = (): void => {
      if (timeout !== null) {
        window.clearTimeout(timeout)
        timeout = null
      }
      signal.removeEventListener('abort', onAbort)
    }
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      runner.pending.delete(id)
      cleanup()
      reject(error)
    }
    const cancelRunnerRequest = (): void => {
      try {
        runner.port.postMessage({ type: 'CANCEL_TILE', id })
      } catch {
        // Runner invalidation below is the active cancellation mechanism.
      }
    }
    onAbort = (): void => {
      const error = createAbortError()
      rejectOnce(error)
      cancelRunnerRequest()
      invalidateRunner(runner, error)
    }
    timeout = window.setTimeout(() => {
      const error = new Error(`Real-ESRGAN tile timed out after ${RUNNER_TIMEOUT_MS}ms`)
      rejectOnce(error)
      cancelRunnerRequest()
      invalidateRunner(runner, error)
    }, RUNNER_TIMEOUT_MS)

    runner.pending.set(id, { resolve, reject, cleanup })
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      runner.port.postMessage({
        type: 'RUN_TILE',
        id,
        input,
        model,
        context,
        tileCount,
        tile,
      })
    } catch (error) {
      const postError = error instanceof Error ? error : new Error(String(error))
      rejectOnce(postError)
      invalidateRunner(runner, postError)
    }
  })
}

function fillTileInput(
  input: ModelInput,
  source: ImageData,
  tileX: number,
  tileY: number,
  inputSize: number,
  padding: number,
  dtype: 'float32' | 'uint8',
): void {
  const { data, width, height } = source
  let offset = 0

  for (let y = 0; y < inputSize; y += 1) {
    const sourceY = Math.min(height - 1, Math.max(0, tileY + y - padding))
    for (let x = 0; x < inputSize; x += 1) {
      const sourceX = Math.min(width - 1, Math.max(0, tileX + x - padding))
      const sourceOffset = (sourceY * width + sourceX) * 4
      if (dtype === 'uint8') {
        input[offset] = data[sourceOffset]
        input[offset + 1] = data[sourceOffset + 1]
        input[offset + 2] = data[sourceOffset + 2]
      } else {
        input[offset] = data[sourceOffset] / 255
        input[offset + 1] = data[sourceOffset + 1] / 255
        input[offset + 2] = data[sourceOffset + 2] / 255
      }
      offset += 3
    }
  }
}

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null)
    }, 'image/png')
  })
}

export async function createRealEsrganObjectUrl(
  source: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  model: AiEnhancementModel,
  context: EnhancementLogContext,
  signal: AbortSignal,
): Promise<string | null> {
  const sourceWidth = source.naturalWidth
  const sourceHeight = source.naturalHeight
  if (sourceWidth < 1 || sourceHeight < 1) return null

  const config = getRealEsrganModelConfig(model)
  const modelScale = config.outputSize / config.inputSize
  const tileContentSize = config.tileContentSize
  const startedAt = performance.now()
  const columns = Math.ceil(sourceWidth / tileContentSize)
  const rows = Math.ceil(sourceHeight / tileContentSize)
  const tileCount = columns * rows
  if (tileCount > config.maxTiles) {
    throw new Error(`Real-ESRGAN ${model} tile limit exceeded: ${tileCount} > ${config.maxTiles}`)
  }

  logImageEnhancement('info', 'ai_upscale_start', context, {
    model,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    tileCount,
    tileContentSize,
    tilePadding: config.padding,
    dtype: config.dtype,
  })

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceWidth
  sourceCanvas.height = sourceHeight
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null

  let sourceData: ImageData
  try {
    sourceContext.drawImage(source, 0, 0)
    sourceData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  } catch (error) {
    logImageEnhancement('warn', 'source_pixels_unavailable', context, errorDetails(error))
    throw error
  }

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight
  const targetContext = targetCanvas.getContext('2d')
  if (!targetContext) return null

  const tileCanvas = document.createElement('canvas')
  tileCanvas.width = config.outputSize
  tileCanvas.height = config.outputSize
  const tileContext = tileCanvas.getContext('2d')
  if (!tileContext) return null

  const input = config.dtype === 'uint8'
    ? new Uint8Array(config.inputSize * config.inputSize * 3)
    : new Float32Array(config.inputSize * config.inputSize * 3)
  let backend: Accelerator | null = null
  let tileIndex = 0

  try {
    for (let row = 0; row < rows; row += 1) {
      const sourceY = row * tileContentSize
      const contentHeight = Math.min(tileContentSize, sourceHeight - sourceY)

      for (let column = 0; column < columns; column += 1) {
        throwIfAborted(signal)
        const sourceX = column * tileContentSize
        const contentWidth = Math.min(tileContentSize, sourceWidth - sourceX)
        tileIndex += 1
        fillTileInput(
          input,
          sourceData,
          sourceX,
          sourceY,
          config.inputSize,
          config.padding,
          config.dtype,
        )

        const result = await runTile(input, model, context, {
          model,
          tileIndex,
          tileCount,
          row,
          column,
        }, tileCount, signal)
        backend = result.backend
        tileContext.putImageData(
          new ImageData(result.rgba, config.outputSize, config.outputSize),
          0,
          0,
        )

        const targetX = Math.round((sourceX / sourceWidth) * targetWidth)
        const targetY = Math.round((sourceY / sourceHeight) * targetHeight)
        const targetRight = Math.round(
          ((sourceX + contentWidth) / sourceWidth) * targetWidth,
        )
        const targetBottom = Math.round(
          ((sourceY + contentHeight) / sourceHeight) * targetHeight,
        )

        targetContext.drawImage(
          tileCanvas,
          config.padding * modelScale,
          config.padding * modelScale,
          contentWidth * modelScale,
          contentHeight * modelScale,
          targetX,
          targetY,
          targetRight - targetX,
          targetBottom - targetY,
        )
      }
    }

    throwIfAborted(signal)
    targetContext.globalCompositeOperation = 'destination-in'
    targetContext.drawImage(source, 0, 0, targetWidth, targetHeight)
    targetContext.globalCompositeOperation = 'source-over'

    const encodeStartedAt = performance.now()
    const objectUrl = await canvasToObjectUrl(targetCanvas)
    if (signal.aborted) {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      throwIfAborted(signal)
    }
    logImageEnhancement('info', 'ai_upscale_complete', context, {
      model,
      backend,
      tileCount,
      durationMs: Math.round(performance.now() - startedAt),
      encodeDurationMs: Math.round(performance.now() - encodeStartedAt),
      targetWidth,
      targetHeight,
    })
    return objectUrl
  } finally {
    sourceCanvas.width = 0
    sourceCanvas.height = 0
    targetCanvas.width = 0
    targetCanvas.height = 0
    tileCanvas.width = 0
    tileCanvas.height = 0
  }
}

export function disposeRealEsrgan(context: EnhancementLogContext): void {
  const runner = activeRunner
  if (runner) {
    invalidateRunner(runner, new Error('LiteRT runner disposed'))
    logImageEnhancement('info', 'runner_disposed', context)
    return
  }

  const pendingRunner = runnerPromise
  runnerPromise = null
  if (!pendingRunner) return

  void pendingRunner.then((createdRunner) => {
    invalidateRunner(createdRunner, new Error('LiteRT runner disposed'))
    logImageEnhancement('info', 'runner_disposed', context)
  }).catch((error: unknown) => {
    logImageEnhancement('warn', 'runner_dispose_failed', context, errorDetails(error))
  })
}
