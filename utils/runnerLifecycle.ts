export type RemovableEventTarget = EventTarget & { remove: () => void }

export type RunnerPendingRequest = {
  cleanup: () => void
  reject: (error: Error) => void
}

export type RunnerCleanupResources<T extends RunnerPendingRequest = RunnerPendingRequest> = {
  removeFrame: () => void
  removeListeners?: () => void
  clearTimers?: () => void
  closePort?: () => void
  pending?: Map<number, T>
  cleanupState?: { cleaned: boolean }
}

export function cleanupRunnerResources<T extends RunnerPendingRequest>(
  resources: RunnerCleanupResources<T>,
  error = new Error('LiteRT runner creation failed'),
): void {
  if (resources.cleanupState?.cleaned) return
  if (resources.cleanupState) resources.cleanupState.cleaned = true
  resources.removeListeners?.()
  resources.clearTimers?.()
  const pending = resources.pending
  resources.pending = undefined
  pending?.forEach((request) => {
    request.cleanup()
    request.reject(error)
  })
  pending?.clear()
  resources.closePort?.()
  resources.removeFrame()
}

export function waitForRunnerFrame<T extends RemovableEventTarget>(
  frame: T,
  appendFrame: (frame: T) => void,
  timeoutMs: number,
  onFailure: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const cleanupListeners = (): void => {
      frame.removeEventListener('load', onLoad)
      frame.removeEventListener('error', onError)
      if (timeout !== null) {
        clearTimeout(timeout)
        timeout = null
      }
    }
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      cleanupListeners()
      onFailure()
      reject(error)
    }
    const onLoad = (): void => {
      if (settled) return
      settled = true
      cleanupListeners()
      resolve(frame)
    }
    const onError = (): void => {
      fail(new Error('LiteRT runner failed to load'))
    }

    frame.addEventListener('load', onLoad)
    frame.addEventListener('error', onError)
    timeout = setTimeout(() => {
      fail(new Error('LiteRT runner load timed out'))
    }, timeoutMs)

    try {
      appendFrame(frame)
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
