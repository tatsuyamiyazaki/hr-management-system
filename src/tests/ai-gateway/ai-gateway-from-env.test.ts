import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createAIGatewayFromEnv } from '@/lib/ai-gateway/ai-gateway'
import { AIConfigurationError } from '@/lib/ai-gateway/ai-gateway-types'

// ioredis の Redis クラスを no-op にモックし、REDIS_URL が設定された場合でも
// テスト実行時にネットワーク接続が発生しないようにする。
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  })),
}))

// ─────────────────────────────────────────────────────────────────────────────
// env helpers
// ─────────────────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'AI_PROVIDER',
  'REDIS_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
] as const

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {}
  for (const key of ENV_KEYS) snap[key] = process.env[key]
  return snap
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = snap[key]
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createAIGatewayFromEnv', () => {
  let snap: Record<string, string | undefined>

  beforeEach(() => {
    snap = snapshotEnv()
    for (const key of ENV_KEYS) delete process.env[key]
  })

  afterEach(() => {
    restoreEnv(snap)
  })

  it('defaults to claude provider when AI_PROVIDER is unset', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const gateway = createAIGatewayFromEnv()
    expect(gateway.getCurrentProvider()).toBe('claude')
  })

  it('uses claude when AI_PROVIDER=claude', () => {
    process.env.AI_PROVIDER = 'claude'
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const gateway = createAIGatewayFromEnv()
    expect(gateway.getCurrentProvider()).toBe('claude')
  })

  it('uses openai when AI_PROVIDER=openai', () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'sk-test'
    const gateway = createAIGatewayFromEnv()
    expect(gateway.getCurrentProvider()).toBe('openai')
  })

  it('throws AIConfigurationError for unknown AI_PROVIDER', () => {
    process.env.AI_PROVIDER = 'gemini'
    expect(() => createAIGatewayFromEnv()).toThrow(AIConfigurationError)
  })

  it('throws AIConfigurationError when selected provider has no API key', () => {
    process.env.AI_PROVIDER = 'openai'
    // OPENAI_API_KEY intentionally unset
    expect(() => createAIGatewayFromEnv()).toThrow(AIConfigurationError)
  })

  it('falls back to InMemory cache when REDIS_URL is not set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    // REDIS_URL unset → ゲートウェイ生成が成功すること (Redis 接続失敗しないこと)
    expect(() => createAIGatewayFromEnv()).not.toThrow()
  })

  it('accepts overrides.provider and skips env-based provider construction', () => {
    // env に API キーがない状態でも overrides.provider を渡せば作成できる
    const gateway = createAIGatewayFromEnv({
      provider: {
        name: 'claude',
        chat: vi.fn(),
      },
    })
    expect(gateway.getCurrentProvider()).toBe('claude')
  })
})
