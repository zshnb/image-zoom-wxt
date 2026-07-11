import { describe, expect, it } from 'vitest'
import {
  isClaimRunnerSessionMessage,
  isRunnerRequest,
  RunnerSessionStore,
} from './runnerProtocol'

const validInput = new Float32Array(128 * 128 * 3)
const validRequest = {
  type: 'RUN_TILE',
  id: 1,
  input: validInput,
  model: 'general-x4v3',
  context: { sessionId: 'session', requestId: 1 },
  tile: { tile: '1/1' },
}

describe('runner request validation', () => {
  it('accepts valid requests for both supported models', () => {
    expect(isRunnerRequest(validRequest)).toBe(true)
    expect(isRunnerRequest({
      ...validRequest,
      model: 'x4plus',
      input: new Uint8Array(128 * 128 * 3),
    })).toBe(true)
    expect(isRunnerRequest({ type: 'CANCEL_TILE', id: 1 })).toBe(true)
    expect(isRunnerRequest({ type: 'DISPOSE' })).toBe(true)
  })

  it.each([
    { ...validRequest, type: 'UNKNOWN' },
    { ...validRequest, id: 0 },
    { ...validRequest, id: 1.5 },
    { ...validRequest, model: 'unknown' },
    { ...validRequest, input: new Uint8Array(128 * 128 * 3) },
    { ...validRequest, input: new Float32Array(10) },
    { ...validRequest, context: { sessionId: '' } },
    { type: 'DISPOSE', extra: true },
  ])('rejects malformed request %#', (request) => {
    expect(isRunnerRequest(request)).toBe(false)
  })
})

describe('runner session messages', () => {
  it('strictly validates claim tokens', () => {
    expect(isClaimRunnerSessionMessage({
      type: 'CLAIM_LITERT_RUNNER_SESSION',
      token: '12345678-1234-1234-1234-123456789abc',
    })).toBe(true)
    expect(isClaimRunnerSessionMessage({ type: 'CLAIM_LITERT_RUNNER_SESSION', token: '' })).toBe(false)
    expect(isClaimRunnerSessionMessage({
      type: 'CLAIM_LITERT_RUNNER_SESSION',
      token: '12345678-1234-1234-1234-123456789abc',
      extra: true,
    })).toBe(false)
  })

  it('allows the issuing tab to claim exactly once', () => {
    const store = new RunnerSessionStore(() => '12345678-1234-1234-1234-123456789abc')
    const token = store.issue(7, 1_000)

    expect(store.claim(token, 7, 1_001)).toBe(true)
    expect(store.claim(token, 7, 1_002)).toBe(false)
  })

  it('rejects wrong tabs, unknown tokens, and expired sessions', () => {
    let index = 0
    const store = new RunnerSessionStore(() => `12345678-1234-1234-1234-${String(index += 1).padStart(12, '0')}`)
    const wrongTabToken = store.issue(7, 1_000)
    const expiredToken = store.issue(8, 1_000)

    expect(store.claim(wrongTabToken, 8, 1_001)).toBe(false)
    expect(store.claim('unknown-token-value-that-is-long-enough', 7, 1_001)).toBe(false)
    expect(store.claim(expiredToken, 8, 31_000)).toBe(false)
  })

  it('caps abandoned sessions and prunes expired entries', () => {
    let index = 0
    const store = new RunnerSessionStore(
      () => `12345678-1234-1234-1234-${String(index += 1).padStart(12, '0')}`,
      30_000,
      2,
    )
    store.issue(1, 0)
    store.issue(1, 1)
    store.issue(1, 2)
    expect(store.size).toBe(2)
    store.issue(1, 30_002)
    expect(store.size).toBe(1)
  })
})
