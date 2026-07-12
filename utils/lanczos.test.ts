import { describe, expect, it, vi } from 'vitest'
import { resizeLanczos3 } from './lanczos'

const source = new Uint8ClampedArray([
  50, 100, 150, 255,
  50, 100, 150, 255,
  50, 100, 150, 255,
  50, 100, 150, 255,
])

describe('resizeLanczos3', () => {
  it('keeps representative pixels and dimensions for a uniform image', async () => {
    const yieldControl = vi.fn(async () => {})

    const output = await resizeLanczos3(
      source,
      2,
      2,
      4,
      4,
      new AbortController().signal,
      yieldControl,
    )

    expect(output).toHaveLength(4 * 4 * 4)
    expect(Array.from(output).every((value, index) => {
      const channel = index % 4
      return value === [50, 100, 150, 255][channel]
    })).toBe(true)
    expect(yieldControl).toHaveBeenCalledTimes(6)
  })

  it('rejects before allocating large intermediate buffers when already aborted', async () => {
    const controller = new AbortController()
    const yieldControl = vi.fn(async () => {})
    controller.abort()

    await expect(resizeLanczos3(
      source,
      2,
      2,
      2_000,
      2_000,
      controller.signal,
      yieldControl,
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(yieldControl).not.toHaveBeenCalled()
  })

  it('stops during the horizontal pass when a yield cancels the request', async () => {
    const controller = new AbortController()
    const yieldControl = vi.fn(async () => controller.abort())

    await expect(resizeLanczos3(
      source,
      2,
      2,
      4,
      2,
      controller.signal,
      yieldControl,
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(yieldControl).toHaveBeenCalledTimes(1)
  })

  it('stops during the vertical pass and does not yield again', async () => {
    const controller = new AbortController()
    const yieldControl = vi.fn(async () => {
      if (yieldControl.mock.calls.length === 3) controller.abort()
    })

    await expect(resizeLanczos3(
      source,
      2,
      2,
      4,
      3,
      controller.signal,
      yieldControl,
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(yieldControl).toHaveBeenCalledTimes(3)
  })
})
