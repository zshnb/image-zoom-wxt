const LANCZOS_RADIUS = 3
const RESIZE_YIELD_MS = 12

type ResizeWeight = { indices: number[]; weights: number[] }
export type LanczosYield = () => Promise<void>

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Image enhancement canceled', 'AbortError')
}

function sinc(value: number): number {
  if (value === 0) return 1
  const angle = Math.PI * value
  return Math.sin(angle) / angle
}

function lanczos3(value: number): number {
  const x = Math.abs(value)
  if (x >= LANCZOS_RADIUS) return 0
  return sinc(x) * sinc(x / LANCZOS_RADIUS)
}

function createLanczosWeights(
  sourceSize: number,
  targetSize: number,
  signal: AbortSignal,
): ResizeWeight[] {
  const scale = targetSize / sourceSize
  const weights: ResizeWeight[] = []

  for (let target = 0; target < targetSize; target += 1) {
    if (target % 16 === 0) throwIfAborted(signal)
    const sourceCenter = (target + 0.5) / scale - 0.5
    const start = Math.ceil(sourceCenter - LANCZOS_RADIUS)
    const end = Math.floor(sourceCenter + LANCZOS_RADIUS)
    const indices: number[] = []
    const values: number[] = []
    let total = 0

    for (let source = start; source <= end; source += 1) {
      if (source < 0 || source >= sourceSize) continue

      const weight = lanczos3(sourceCenter - source)
      if (weight === 0) continue

      indices.push(source)
      values.push(weight)
      total += weight
    }

    if (total !== 0) {
      for (let index = 0; index < values.length; index += 1) {
        values[index] /= total
      }
    }
    weights.push({ indices, weights: values })
  }

  return weights
}

export async function resizeLanczos3(
  sourceData: Uint8ClampedArray<ArrayBuffer>,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  signal: AbortSignal,
  yieldControl?: LanczosYield,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  throwIfAborted(signal)
  const horizontalWeights = createLanczosWeights(sourceWidth, targetWidth, signal)
  const verticalWeights = createLanczosWeights(sourceHeight, targetHeight, signal)
  throwIfAborted(signal)
  const horizontal = new Float32Array(targetWidth * sourceHeight * 4)
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  let lastYield = performance.now()

  const maybeYield = async (): Promise<void> => {
    throwIfAborted(signal)
    if (yieldControl) {
      await yieldControl()
      throwIfAborted(signal)
      return
    }
    if (performance.now() - lastYield < RESIZE_YIELD_MS) return
    throwIfAborted(signal)
    await waitForNextFrame()
    throwIfAborted(signal)
    lastYield = performance.now()
  }

  for (let y = 0; y < sourceHeight; y += 1) {
    throwIfAborted(signal)
    for (let x = 0; x < targetWidth; x += 1) {
      if (x % 16 === 0) throwIfAborted(signal)
      const { indices, weights } = horizontalWeights[x]
      const targetOffset = (y * targetWidth + x) * 4

      for (let i = 0; i < indices.length; i += 1) {
        const sourceOffset = (y * sourceWidth + indices[i]) * 4
        const weight = weights[i]
        horizontal[targetOffset] += sourceData[sourceOffset] * weight
        horizontal[targetOffset + 1] += sourceData[sourceOffset + 1] * weight
        horizontal[targetOffset + 2] += sourceData[sourceOffset + 2] * weight
        horizontal[targetOffset + 3] += sourceData[sourceOffset + 3] * weight
      }
    }

    await maybeYield()
  }

  for (let y = 0; y < targetHeight; y += 1) {
    throwIfAborted(signal)
    const { indices, weights } = verticalWeights[y]

    for (let x = 0; x < targetWidth; x += 1) {
      if (x % 16 === 0) throwIfAborted(signal)
      const targetOffset = (y * targetWidth + x) * 4
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (let i = 0; i < indices.length; i += 1) {
        const sourceOffset = (indices[i] * targetWidth + x) * 4
        const weight = weights[i]
        red += horizontal[sourceOffset] * weight
        green += horizontal[sourceOffset + 1] * weight
        blue += horizontal[sourceOffset + 2] * weight
        alpha += horizontal[sourceOffset + 3] * weight
      }

      output[targetOffset] = red
      output[targetOffset + 1] = green
      output[targetOffset + 2] = blue
      output[targetOffset + 3] = alpha
    }

    await maybeYield()
  }

  throwIfAborted(signal)
  return output
}
