export type EnhancementLogContext = {
  sessionId: string
  requestId?: number
}

type Accelerator = 'webgpu' | 'wasm'
type EnhancementLogLevel = 'debug' | 'info' | 'warn' | 'error'
type EnhancementLogData = Record<string, unknown>
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
type RunnerClient = {
  iframe: HTMLIFrameElement
  port: MessagePort
  pending: Map<number, PendingRequest>
  nextId: number
}

const MODEL_INPUT_SIZE = 128
const MODEL_OUTPUT_SIZE = 512
const MODEL_SCALE = MODEL_OUTPUT_SIZE / MODEL_INPUT_SIZE
const TILE_PADDING = 16
const TILE_CONTENT_SIZE = MODEL_INPUT_SIZE - TILE_PADDING * 2
const MAX_AI_TILES = 100
const MAX_WASM_AI_TILES = 9
const RUNNER_TIMEOUT_MS = 120_000
const LOG_PREFIX = '[ImageZoom][enhancement]'

let runnerPromise: Promise<RunnerClient> | null = null

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

  logImageEnhancement('info', 'runner_create_start', context, { iframeUrl })
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('LiteRT runner load timed out')), 10_000)
    iframe.addEventListener('load', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
    iframe.addEventListener('error', () => {
      window.clearTimeout(timeout)
      reject(new Error('LiteRT runner failed to load'))
    }, { once: true })
    document.documentElement.appendChild(iframe)
  })

  if (!iframe.contentWindow) {
    iframe.remove()
    throw new Error('LiteRT runner window is unavailable')
  }

  const channel = new MessageChannel()
  const pending = new Map<number, PendingRequest>()
  let readyResolve: (() => void) | null = null
  let readyReject: ((error: Error) => void) | null = null
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })

  channel.port1.addEventListener('message', (event: MessageEvent<RunnerResponse>) => {
    const response = event.data
    if (response.type === 'READY') {
      readyResolve?.()
      return
    }

    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
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
  })
  channel.port1.addEventListener('messageerror', () => {
    const error = new Error('LiteRT runner message could not be decoded')
    readyReject?.(error)
    pending.forEach((request) => {
      request.cleanup()
      request.reject(error)
    })
    pending.clear()
  })
  channel.port1.start()
  iframe.contentWindow.postMessage(
    { type: 'IMAGE_ZOOM_LITERT_CONNECT' },
    new URL(iframeUrl).origin,
    [channel.port2],
  )

  const readyTimeout = window.setTimeout(() => {
    readyReject?.(new Error('LiteRT runner handshake timed out'))
  }, 10_000)

  try {
    await ready
  } catch (error) {
    channel.port1.close()
    iframe.remove()
    throw error
  } finally {
    window.clearTimeout(readyTimeout)
  }

  logImageEnhancement('info', 'runner_ready', context, {
    durationMs: Math.round(performance.now() - startedAt),
  })
  return { iframe, port: channel.port1, pending, nextId: 1 }
}

async function getRunner(context: EnhancementLogContext): Promise<RunnerClient> {
  if (!runnerPromise) {
    runnerPromise = createRunner(context).catch((error: unknown) => {
      runnerPromise = null
      logImageEnhancement('error', 'runner_create_failed', context, errorDetails(error))
      throw error
    })
  }
  return runnerPromise
}

async function runTile(
  input: Float32Array,
  context: EnhancementLogContext,
  tile: EnhancementLogData,
  signal: AbortSignal,
): Promise<TileResult> {
  throwIfAborted(signal)
  const runner = await getRunner(context)
  throwIfAborted(signal)
  const id = runner.nextId
  runner.nextId += 1

  return new Promise<TileResult>((resolve, reject) => {
    const onAbort = (): void => {
      runner.pending.delete(id)
      runner.port.postMessage({ type: 'CANCEL_TILE', id })
      cleanup()
      reject(new DOMException('Image enhancement canceled', 'AbortError'))
    }
    const timeout = window.setTimeout(() => {
      runner.pending.delete(id)
      runner.port.postMessage({ type: 'CANCEL_TILE', id })
      cleanup()
      reject(new Error(`Real-ESRGAN tile timed out after ${RUNNER_TIMEOUT_MS}ms`))
    }, RUNNER_TIMEOUT_MS)
    const cleanup = (): void => {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }

    runner.pending.set(id, { resolve, reject, cleanup })
    signal.addEventListener('abort', onAbort, { once: true })
    runner.port.postMessage({
      type: 'RUN_TILE',
      id,
      input,
      context,
      tile,
    })
  })
}

function fillTileInput(
  input: Float32Array,
  source: ImageData,
  tileX: number,
  tileY: number,
): void {
  const { data, width, height } = source
  let offset = 0

  for (let y = 0; y < MODEL_INPUT_SIZE; y += 1) {
    const sourceY = Math.min(height - 1, Math.max(0, tileY + y - TILE_PADDING))
    for (let x = 0; x < MODEL_INPUT_SIZE; x += 1) {
      const sourceX = Math.min(width - 1, Math.max(0, tileX + x - TILE_PADDING))
      const sourceOffset = (sourceY * width + sourceX) * 4
      input[offset] = data[sourceOffset] / 255
      input[offset + 1] = data[sourceOffset + 1] / 255
      input[offset + 2] = data[sourceOffset + 2] / 255
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
  strength: number,
  context: EnhancementLogContext,
  signal: AbortSignal,
): Promise<string | null> {
  const sourceWidth = source.naturalWidth
  const sourceHeight = source.naturalHeight
  if (sourceWidth < 1 || sourceHeight < 1) return null

  const startedAt = performance.now()
  const columns = Math.ceil(sourceWidth / TILE_CONTENT_SIZE)
  const rows = Math.ceil(sourceHeight / TILE_CONTENT_SIZE)
  const tileCount = columns * rows
  if (tileCount > MAX_AI_TILES) {
    throw new Error(`Real-ESRGAN tile limit exceeded: ${tileCount} > ${MAX_AI_TILES}`)
  }

  logImageEnhancement('info', 'ai_upscale_start', context, {
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    tileCount,
    tileContentSize: TILE_CONTENT_SIZE,
    tilePadding: TILE_PADDING,
    strength,
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
  tileCanvas.width = MODEL_OUTPUT_SIZE
  tileCanvas.height = MODEL_OUTPUT_SIZE
  const tileContext = tileCanvas.getContext('2d')
  if (!tileContext) return null

  const input = new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3)
  let backend: Accelerator | null = null
  let tileIndex = 0

  try {
    for (let row = 0; row < rows; row += 1) {
      const sourceY = row * TILE_CONTENT_SIZE
      const contentHeight = Math.min(TILE_CONTENT_SIZE, sourceHeight - sourceY)

      for (let column = 0; column < columns; column += 1) {
        throwIfAborted(signal)
        const sourceX = column * TILE_CONTENT_SIZE
        const contentWidth = Math.min(TILE_CONTENT_SIZE, sourceWidth - sourceX)
        tileIndex += 1
        fillTileInput(input, sourceData, sourceX, sourceY)

        const result = await runTile(input, context, {
          tileIndex,
          tileCount,
          row,
          column,
        }, signal)
        backend = result.backend
        if (backend === 'wasm' && tileCount > MAX_WASM_AI_TILES) {
          logImageEnhancement('warn', 'wasm_tile_limit', context, {
            tileCount,
            maxTiles: MAX_WASM_AI_TILES,
          })
          throw new Error(
            `Real-ESRGAN Wasm tile limit exceeded: ${tileCount} > ${MAX_WASM_AI_TILES}`,
          )
        }
        tileContext.putImageData(
          new ImageData(result.rgba, MODEL_OUTPUT_SIZE, MODEL_OUTPUT_SIZE),
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
          TILE_PADDING * MODEL_SCALE,
          TILE_PADDING * MODEL_SCALE,
          contentWidth * MODEL_SCALE,
          contentHeight * MODEL_SCALE,
          targetX,
          targetY,
          targetRight - targetX,
          targetBottom - targetY,
        )
      }
    }

    throwIfAborted(signal)
    const normalizedStrength = Math.min(100, Math.max(0, strength)) / 100
    if (normalizedStrength < 1) {
      targetContext.globalAlpha = 1 - normalizedStrength
      targetContext.imageSmoothingEnabled = true
      targetContext.imageSmoothingQuality = 'high'
      targetContext.drawImage(source, 0, 0, targetWidth, targetHeight)
      targetContext.globalAlpha = 1
    }
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
      backend,
      tileCount,
      durationMs: Math.round(performance.now() - startedAt),
      encodeDurationMs: Math.round(performance.now() - encodeStartedAt),
      targetWidth,
      targetHeight,
      strength,
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
  const activeRunner = runnerPromise
  runnerPromise = null
  if (!activeRunner) return

  void activeRunner.then((runner) => {
    runner.pending.forEach((request) => {
      request.cleanup()
      request.reject(new Error('LiteRT runner disposed'))
    })
    runner.pending.clear()
    runner.port.postMessage({ type: 'DISPOSE' })
    runner.port.close()
    runner.iframe.remove()
    logImageEnhancement('info', 'runner_disposed', context)
  }).catch((error: unknown) => {
    logImageEnhancement('warn', 'runner_dispose_failed', context, errorDetails(error))
  })
}
