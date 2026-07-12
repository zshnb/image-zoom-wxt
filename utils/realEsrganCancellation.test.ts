import { describe, expect, it, vi } from 'vitest'
import { invalidateRunner, type RunnerClient } from './realEsrgan'
import { cleanupRunnerResources } from './runnerLifecycle'

type FakePending = {
  cleanup: () => void
  reject: (error: Error) => void
  resolve: (result: unknown) => void
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolvePromise: (value: T) => void = () => undefined
  let rejectPromise: (error: Error) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function createFakeRunner(): {
  runner: RunnerClient
  frameRemove: ReturnType<typeof vi.fn>
  portClose: ReturnType<typeof vi.fn>
  portPost: ReturnType<typeof vi.fn>
  pending: Map<number, FakePending>
} {
  const frameRemove = vi.fn()
  const portClose = vi.fn()
  const portPost = vi.fn()
  const pending = new Map<number, FakePending>()
  const cleanupState = { cleaned: false }
  const runner = {
    iframe: { remove: frameRemove } as unknown as HTMLIFrameElement,
    port: { close: portClose, postMessage: portPost } as unknown as MessagePort,
    pending,
    nextId: 1,
    invalidated: false,
    cleanup: (error: Error): void => {
      cleanupRunnerResources({
        removeFrame: frameRemove,
        closePort: portClose,
        pending,
        cleanupState,
      }, error)
    },
  } as unknown as RunnerClient
  return { runner, frameRemove, portClose, portPost, pending }
}

describe('real-esrgan runner cancellation', () => {
  it('does not start inference when a request is aborted before it starts', () => {
    const controller = new AbortController()
    const started = vi.fn()
    controller.abort()

    expect(controller.signal.aborted).toBe(true)
    if (!controller.signal.aborted) started()
    expect(started).not.toHaveBeenCalled()
  })

  it('invalidates an active runner and removes its iframe', () => {
    const fake = createFakeRunner()
    const pendingCleanup = vi.fn<() => void>()
    const pendingReject = vi.fn<(error: Error) => void>()
    fake.pending.set(1, { cleanup: pendingCleanup, reject: pendingReject, resolve: vi.fn() })

    invalidateRunner(fake.runner, new DOMException('canceled', 'AbortError'))

    expect(fake.runner.invalidated).toBe(true)
    expect(fake.frameRemove).toHaveBeenCalledTimes(1)
    expect(fake.portClose).toHaveBeenCalledTimes(1)
    expect(pendingCleanup).toHaveBeenCalledTimes(1)
    expect(pendingReject).toHaveBeenCalledTimes(1)
  })

  it('rejects every pending request exactly once', () => {
    const fake = createFakeRunner()
    const pending = [1, 2].map(() => ({
      cleanup: vi.fn<() => void>(),
      reject: vi.fn<(error: Error) => void>(),
      resolve: vi.fn(),
    }))
    pending.forEach((request, index) => fake.pending.set(index, request))

    invalidateRunner(fake.runner, new DOMException('canceled', 'AbortError'))

    pending.forEach((request) => {
      expect(request.cleanup).toHaveBeenCalledTimes(1)
      expect(request.reject).toHaveBeenCalledTimes(1)
    })
    expect(fake.pending).toHaveLength(0)
  })

  it('ignores a late response from an invalidated runner port', () => {
    const fake = createFakeRunner()
    const lateResolve = vi.fn()
    fake.pending.set(1, { cleanup: vi.fn(), reject: vi.fn(), resolve: vi.fn() })

    invalidateRunner(fake.runner, new DOMException('canceled', 'AbortError'))
    fake.pending.get(1)?.cleanup()
    lateResolve()

    expect(fake.pending).toHaveLength(0)
    expect(lateResolve).toHaveBeenCalledTimes(1)
  })

  it('allows a fresh runner to complete after the old runner is invalidated', async () => {
    const oldRunner = createFakeRunner()
    const inference = createDeferred<string>()
    const started = vi.fn(() => inference.promise)
    oldRunner.pending.set(1, { cleanup: vi.fn(), reject: vi.fn(), resolve: vi.fn() })
    const oldInference = started()

    invalidateRunner(oldRunner.runner, new DOMException('canceled', 'AbortError'))

    const freshRunner = createFakeRunner()
    inference.resolve('old result')
    await expect(oldInference).resolves.toBe('old result')
    expect(started).toHaveBeenCalledTimes(1)
    expect(freshRunner.runner.invalidated).toBe(false)
    expect(freshRunner.portPost).not.toHaveBeenCalled()
  })

  it('preserves the timeout error when invalidating a timed-out runner', () => {
    const fake = createFakeRunner()
    const timeoutError = new Error('Real-ESRGAN tile timed out after 120000ms')
    const reject = vi.fn()
    fake.pending.set(1, { cleanup: vi.fn(), reject, resolve: vi.fn() })

    invalidateRunner(fake.runner, timeoutError)

    expect(reject).toHaveBeenCalledTimes(1)
    expect(reject).toHaveBeenCalledWith(timeoutError)
  })

  it('keeps repeated invalidation idempotent', () => {
    const fake = createFakeRunner()
    const pendingCleanup = vi.fn<() => void>()
    const pendingReject = vi.fn<(error: Error) => void>()
    fake.pending.set(1, { cleanup: pendingCleanup, reject: pendingReject, resolve: vi.fn() })
    const error = new DOMException('canceled', 'AbortError')

    invalidateRunner(fake.runner, error)
    invalidateRunner(fake.runner, error)

    expect(fake.frameRemove).toHaveBeenCalledTimes(1)
    expect(fake.portClose).toHaveBeenCalledTimes(1)
    expect(pendingCleanup).toHaveBeenCalledTimes(1)
    expect(pendingReject).toHaveBeenCalledTimes(1)
  })
})
