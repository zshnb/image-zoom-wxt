import { describe, expect, it, vi } from 'vitest'
import {
  fetchBoundedImage,
  readBoundedResponseBody,
  resolveImageFetchPolicy,
} from './imageFetchPolicy'

describe('image fetch policy', () => {
  it.each([
    'http://127.0.0.1/image.png',
    'http://2130706433/image.png',
    'http://0177.0.0.1/image.png',
    'http://0x7f000001/image.png',
    'http://10.0.0.1/image.png',
    'http://169.254.1.2/image.png',
    'http://172.16.0.1/image.png',
    'http://192.168.0.1/image.png',
    'http://224.0.0.1/image.png',
    'http://[::]/image.png',
    'http://[::1]/image.png',
    'http://[fe80::1]/image.png',
    'http://[fc00::1]/image.png',
    'http://[ff02::1]/image.png',
    'http://[::ffff:127.0.0.1]/image.png',
    'http://user:password@example.com/image.png',
    'ftp://example.com/image.png',
    'http://example.com:99999/image.png',
  ])('rejects unsafe requested URL %s', (url) => {
    expect(resolveImageFetchPolicy(url, 'https://example.com/page')).toEqual({
      ok: false,
      error: 'unsupported_or_private_url',
    })
  })

  it.each(['', 'not a url', 'chrome-extension://abc/page.html', 'http://localhost/page']) (
    'rejects invalid sender URL %s',
    (senderUrl) => {
      expect(resolveImageFetchPolicy('https://example.com/image.png', senderUrl)).toEqual({
        ok: false,
        error: 'invalid_sender',
      })
    },
  )

  it('includes credentials only for the exact sender origin', () => {
    expect(resolveImageFetchPolicy(
      'https://example.com/image.png',
      'https://example.com/page',
    )).toMatchObject({ ok: true, credentials: 'include' })
    expect(resolveImageFetchPolicy(
      'https://cdn.example.com/image.png',
      'https://example.com/page',
    )).toMatchObject({ ok: true, credentials: 'omit' })
    expect(resolveImageFetchPolicy(
      'http://example.com/image.png',
      'https://example.com/page',
    )).toMatchObject({ ok: true, credentials: 'omit' })
  })
})

function responseWithStream(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  }))
}

describe('bounded response streaming', () => {
  it('accepts an exact-limit body and combines many chunks once', async () => {
    const result = await readBoundedResponseBody(
      responseWithStream([new Uint8Array([1]), new Uint8Array([2, 3])]),
      3,
    )
    expect(result).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]) })
  })

  it('cancels as soon as the body exceeds the limit', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3))
        controller.enqueue(new Uint8Array(1))
      },
      cancel,
    }))

    await expect(readBoundedResponseBody(response, 3)).resolves.toEqual({
      ok: false,
      error: 'image_too_large',
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('handles a missing body and stream failures with stable errors', async () => {
    await expect(readBoundedResponseBody(new Response(null), 3)).resolves.toEqual({
      ok: false,
      error: 'missing_body',
    })

    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('sensitive internal detail'))
      },
    }))
    await expect(readBoundedResponseBody(response, 3)).resolves.toEqual({
      ok: false,
      error: 'stream_error',
    })
  })
})

describe('bounded image fetch', () => {
  it.each([
    ['include', 'include'],
    ['omit', 'omit'],
  ] as const)('rejects redirects and uses %s credentials', async (credentials, expected) => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: { 'content-type': 'image/png' },
    }))

    await expect(fetchBoundedImage(
      new URL('https://example.com/image.png'),
      credentials,
      10,
      fetcher,
    )).resolves.toMatchObject({ ok: true })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      credentials: expected,
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    }))
  })

  it('rejects a declared oversized body before reading it', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const fetcher = vi.fn(async () => new Response(body, {
      headers: { 'content-length': '11', 'content-type': 'image/png' },
    }))
    await expect(fetchBoundedImage(
      new URL('https://example.com/image.png'),
      'omit',
      10,
      fetcher,
    )).resolves.toEqual({ ok: false, error: 'image_too_large' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects wrong MIME and maps fetch failures to generic errors', async () => {
    await expect(fetchBoundedImage(
      new URL('https://example.com/file.txt'),
      'omit',
      10,
      vi.fn(async () => new Response('text', { headers: { 'content-type': 'text/plain' } })),
    )).resolves.toEqual({ ok: false, error: 'not_an_image' })
    await expect(fetchBoundedImage(
      new URL('https://example.com/image.png'),
      'omit',
      10,
      vi.fn(async () => { throw new Error('private network detail') }),
    )).resolves.toEqual({ ok: false, error: 'network_error' })
  })

  it('enforces the streamed limit when Content-Length lies', async () => {
    const fetcher = vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6))
          controller.enqueue(new Uint8Array(5))
        },
      }),
      { headers: { 'content-length': '1', 'content-type': 'image/png' } },
    ))
    await expect(fetchBoundedImage(
      new URL('https://example.com/image.png'),
      'omit',
      10,
      fetcher,
    )).resolves.toEqual({ ok: false, error: 'image_too_large' })
  })
})
