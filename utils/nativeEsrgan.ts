import type { AiEnhancementModel } from './storage'
import type { NativeEsrganResponse } from './nativeEsrganProtocol'

function createAbortError(): DOMException {
  return new DOMException('Image enhancement canceled', 'AbortError')
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode source image'))
    }, 'image/png')
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode image'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function sendNativeUpscale(
  imageBase64: string,
  model: AiEnhancementModel,
  signal: AbortSignal,
): Promise<NativeEsrganResponse> {
  if (signal.aborted) throw createAbortError()
  const requestId = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    const cancel = (): void => {
      void browser.runtime
        .sendMessage({
          type: 'CANCEL_NATIVE_ESRGAN',
          requestId,
        })
        .catch(() => undefined)
      reject(createAbortError())
    }
    signal.addEventListener('abort', cancel, { once: true })

    void browser.runtime.sendMessage({
      type: 'NATIVE_ESRGAN_UPSCALE',
      requestId,
      imageBase64,
      model,
    }).then(
      (response: NativeEsrganResponse) => {
        signal.removeEventListener('abort', cancel)
        if (signal.aborted) reject(createAbortError())
        else resolve(response)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      },
    )
  })
}

export async function createNativeEsrganObjectUrl(
  source: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  model: AiEnhancementModel,
  signal: AbortSignal,
): Promise<string> {
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = source.naturalWidth
  sourceCanvas.height = source.naturalHeight
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) throw new Error('Canvas is unavailable')

  try {
    sourceContext.drawImage(source, 0, 0)
    const inputBase64 = await blobToBase64(await canvasToBlob(sourceCanvas))
    if (signal.aborted) throw createAbortError()

    const response = await sendNativeUpscale(inputBase64, model, signal)
    if (!response.ok) throw new Error(response.error)

    const outputBlob = await fetch(
      `data:${response.mimeType};base64,${response.dataBase64}`,
    ).then((result) => result.blob())
    const output = await createImageBitmap(outputBlob)
    if (signal.aborted) {
      output.close()
      throw createAbortError()
    }

    const targetCanvas = document.createElement('canvas')
    targetCanvas.width = targetWidth
    targetCanvas.height = targetHeight
    const targetContext = targetCanvas.getContext('2d')
    if (!targetContext) {
      output.close()
      throw new Error('Canvas is unavailable')
    }

    targetContext.drawImage(output, 0, 0, targetWidth, targetHeight)
    output.close()
    targetContext.globalCompositeOperation = 'destination-in'
    targetContext.drawImage(source, 0, 0, targetWidth, targetHeight)

    const resultBlob = await canvasToBlob(targetCanvas)
    if (signal.aborted) throw createAbortError()
    return URL.createObjectURL(resultBlob)
  } finally {
    sourceCanvas.width = 0
    sourceCanvas.height = 0
  }
}
