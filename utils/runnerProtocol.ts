import { isAiEnhancementModel, type AiEnhancementModel } from '@/utils/storage'

export type RunnerLogContext = {
  sessionId: string
  requestId?: number
}

export type RunnerLogData = Record<string, unknown>
export type RunnerModelInput = Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>
export type RunnerRequest =
  | {
      type: 'RUN_TILE'
      id: number
      input: RunnerModelInput
      model: AiEnhancementModel
      context: RunnerLogContext
      tile: RunnerLogData
    }
  | { type: 'CANCEL_TILE'; id: number }
  | { type: 'DISPOSE' }

export type RunnerResponse =
  | { type: 'READY' }
  | { type: 'RUN_TILE_RESULT'; id: number; backend: 'webgpu' | 'wasm'; rgba: ArrayBuffer }
  | { type: 'RUN_TILE_ERROR'; id: number; errorName?: string; errorMessage: string }

export type IssueRunnerSessionMessage = {
  type: 'ISSUE_LITERT_RUNNER_SESSION'
}

export type ClaimRunnerSessionMessage = {
  type: 'CLAIM_LITERT_RUNNER_SESSION'
  token: string
}

export const RUNNER_SESSION_TTL_MS = 30_000
export const MAX_RUNNER_SESSIONS = 128

const MODEL_INPUTS: Record<AiEnhancementModel, {
  length: number
  inputType: typeof Float32Array | typeof Uint8Array
}> = {
  'general-x4v3': { length: 128 * 128 * 3, inputType: Float32Array },
  x4plus: { length: 128 * 128 * 3, inputType: Uint8Array },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExactKeys(candidate: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(candidate)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isLogContext(value: unknown): value is RunnerLogContext {
  if (!isRecord(value)) return false
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0 || value.sessionId.length > 128) {
    return false
  }
  return value.requestId === undefined || isPositiveInteger(value.requestId)
}

export function isRunnerRequest(value: unknown): value is RunnerRequest {
  if (!isRecord(value)) return false

  if (value.type === 'CANCEL_TILE') {
    return hasExactKeys(value, ['type', 'id']) && isPositiveInteger(value.id)
  }
  if (value.type === 'DISPOSE') return hasExactKeys(value, ['type'])
  if (value.type !== 'RUN_TILE' || !hasExactKeys(
    value,
    ['type', 'id', 'input', 'model', 'context', 'tile'],
  )) return false
  if (!isPositiveInteger(value.id) || !isAiEnhancementModel(value.model)) return false
  if (!isLogContext(value.context) || !isRecord(value.tile)) return false

  const expected = MODEL_INPUTS[value.model]
  return value.input instanceof expected.inputType
    && value.input.buffer instanceof ArrayBuffer
    && value.input.length === expected.length
}

export function isRunnerResponse(value: unknown): value is RunnerResponse {
  if (!isRecord(value)) return false
  if (value.type === 'READY') return hasExactKeys(value, ['type'])
  if (value.type === 'RUN_TILE_RESULT') {
    return hasExactKeys(value, ['type', 'id', 'backend', 'rgba'])
      && isPositiveInteger(value.id)
      && (value.backend === 'webgpu' || value.backend === 'wasm')
      && value.rgba instanceof ArrayBuffer
  }
  if (value.type === 'RUN_TILE_ERROR') {
    return (hasExactKeys(value, ['type', 'id', 'errorMessage'])
      || hasExactKeys(value, ['type', 'id', 'errorName', 'errorMessage']))
      && isPositiveInteger(value.id)
      && typeof value.errorMessage === 'string'
      && value.errorMessage.length <= 512
      && (value.errorName === undefined || typeof value.errorName === 'string')
  }
  return false
}

export function isIssueRunnerSessionMessage(value: unknown): value is IssueRunnerSessionMessage {
  return isRecord(value)
    && value.type === 'ISSUE_LITERT_RUNNER_SESSION'
    && hasExactKeys(value, ['type'])
}

export function isClaimRunnerSessionMessage(value: unknown): value is ClaimRunnerSessionMessage {
  return isRecord(value)
    && value.type === 'CLAIM_LITERT_RUNNER_SESSION'
    && typeof value.token === 'string'
    && value.token.length >= 32
    && value.token.length <= 128
    && hasExactKeys(value, ['type', 'token'])
}

type RunnerSession = {
  tabId: number
  expiresAt: number
}

export class RunnerSessionStore {
  private readonly sessions = new Map<string, RunnerSession>()

  constructor(
    private readonly createToken: () => string = () => crypto.randomUUID(),
    private readonly ttlMs = RUNNER_SESSION_TTL_MS,
    private readonly maxSessions = MAX_RUNNER_SESSIONS,
  ) {}

  issue(tabId: number, now = Date.now()): string {
    this.prune(now)
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value
      if (oldest === undefined) break
      this.sessions.delete(oldest)
    }

    const token = this.createToken()
    this.sessions.set(token, { tabId, expiresAt: now + Math.min(this.ttlMs, RUNNER_SESSION_TTL_MS) })
    return token
  }

  claim(token: string, tabId: number, now = Date.now()): boolean {
    this.prune(now)
    const session = this.sessions.get(token)
    if (!session || session.tabId !== tabId || session.expiresAt <= now) return false
    this.sessions.delete(token)
    return true
  }

  get size(): number {
    return this.sessions.size
  }

  private prune(now: number): void {
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
  }
}
