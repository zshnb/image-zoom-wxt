import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupRunnerResources,
  waitForRunnerFrame,
  type RemovableEventTarget,
} from './runnerLifecycle'

class FakeFrame extends EventTarget implements RemovableEventTarget {
  remove = vi.fn()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runner frame lifecycle', () => {
  it('clears the load timeout/listeners after a successful load and keeps the frame', async () => {
    vi.useFakeTimers()
    const frame = new FakeFrame()
    const onFailure = vi.fn()
    const promise = waitForRunnerFrame(frame, vi.fn(), 100, onFailure)

    frame.dispatchEvent(new Event('load'))

    await expect(promise).resolves.toBe(frame)
    vi.advanceTimersByTime(200)
    frame.dispatchEvent(new Event('error'))
    expect(onFailure).not.toHaveBeenCalled()
    expect(frame.remove).not.toHaveBeenCalled()
  })

  it('rejects on load error and removes the frame once', async () => {
    const frame = new FakeFrame()
    const onFailure = vi.fn(() => frame.remove())
    const promise = waitForRunnerFrame(frame, vi.fn(), 100, onFailure)

    frame.dispatchEvent(new Event('error'))

    await expect(promise).rejects.toThrow('failed to load')
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(frame.remove).toHaveBeenCalledTimes(1)
  })

  it('rejects on load timeout and removes the frame once', async () => {
    vi.useFakeTimers()
    const frame = new FakeFrame()
    const onFailure = vi.fn(() => frame.remove())
    const promise = waitForRunnerFrame(frame, vi.fn(), 100, onFailure)

    vi.advanceTimersByTime(100)

    await expect(promise).rejects.toThrow('load timed out')
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(frame.remove).toHaveBeenCalledTimes(1)
  })

  it('failure then retry leaves no failed iframe behind', async () => {
    const firstFrame = new FakeFrame()
    const firstFailure = vi.fn(() => firstFrame.remove())
    const firstPromise = waitForRunnerFrame(firstFrame, vi.fn(), 100, firstFailure)
    firstFrame.dispatchEvent(new Event('error'))
    await expect(firstPromise).rejects.toThrow()

    const secondFrame = new FakeFrame()
    const secondFailure = vi.fn(() => secondFrame.remove())
    const secondPromise = waitForRunnerFrame(secondFrame, vi.fn(), 100, secondFailure)
    secondFrame.dispatchEvent(new Event('load'))
    await expect(secondPromise).resolves.toBe(secondFrame)

    expect(firstFrame.remove).toHaveBeenCalledTimes(1)
    expect(secondFrame.remove).not.toHaveBeenCalled()
  })
})

describe('runner failure cleanup', () => {
  it('closes the port, rejects pending work, and removes the iframe on READY timeout', () => {
    vi.useFakeTimers()
    const removeFrame = vi.fn()
    const closePort = vi.fn()
    const pendingCleanup = vi.fn()
    const pendingReject = vi.fn()
    const pending = new Map([[1, { cleanup: pendingCleanup, reject: pendingReject }]])
    const timeout = setTimeout(() => {
      cleanupRunnerResources({ removeFrame, closePort, pending })
    }, 100)

    vi.advanceTimersByTime(100)

    expect(timeout).toBeDefined()
    expect(closePort).toHaveBeenCalledTimes(1)
    expect(removeFrame).toHaveBeenCalledTimes(1)
    expect(pendingCleanup).toHaveBeenCalledTimes(1)
    expect(pendingReject).toHaveBeenCalledTimes(1)
    expect(pending).toHaveLength(0)
  })
})
