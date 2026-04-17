import { describe, it, expect, vi } from 'vitest'
import type { Redis } from 'ioredis'

import {
  createInMemoryAIResponseCache,
  createRedisAIResponseCache,
  buildCacheKey,
  DEFAULT_AI_CACHE_TTL_SECONDS,
} from '@/lib/ai-gateway/ai-response-cache'
import type { AIChatResponse } from '@/lib/ai-gateway/ai-gateway-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildResponse(overrides: Partial<AIChatResponse> = {}): AIChatResponse {
  return {
    content: 'hello',
    provider: 'claude',
    usage: { promptTokens: 10, completionTokens: 5 },
    cached: false,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCacheKey
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('produces a stable ai:cache:<sha256hex> key for identical input', () => {
    const a = buildCacheKey('claude|ai-coach|[]')
    const b = buildCacheKey('claude|ai-coach|[]')
    expect(a).toBe(b)
    expect(a.startsWith('ai:cache:')).toBe(true)
    // sha256 hex = 64 chars
    expect(a.length).toBe('ai:cache:'.length + 64)
  })

  it('produces different keys for different inputs', () => {
    const a = buildCacheKey('claude|ai-coach|x')
    const b = buildCacheKey('openai|ai-coach|x')
    expect(a).not.toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// InMemory cache
// ─────────────────────────────────────────────────────────────────────────────

describe('createInMemoryAIResponseCache', () => {
  it('returns null when no entry exists', async () => {
    const cache = createInMemoryAIResponseCache(() => 0)
    const result = await cache.get('missing')
    expect(result).toBeNull()
  })

  it('round-trips set and get, injecting cached:true', async () => {
    const cache = createInMemoryAIResponseCache(() => 0)
    const response = buildResponse({ cached: false })

    await cache.set('key-1', response)
    const hit = await cache.get('key-1')

    expect(hit).not.toBeNull()
    expect(hit?.cached).toBe(true)
    expect(hit?.content).toBe('hello')
    expect(hit?.usage.promptTokens).toBe(10)
  })

  it('expires entries after TTL elapses (clock-driven)', async () => {
    let now = 0
    const cache = createInMemoryAIResponseCache(() => now)
    await cache.set('key-1', buildResponse(), 1) // 1 second TTL

    now = 500 // 0.5s later → still valid
    expect(await cache.get('key-1')).not.toBeNull()

    now = 1500 // 1.5s later → expired
    expect(await cache.get('key-1')).toBeNull()
  })

  it('applies DEFAULT_AI_CACHE_TTL_SECONDS when ttl is omitted', async () => {
    let now = 0
    const cache = createInMemoryAIResponseCache(() => now)
    await cache.set('key-1', buildResponse())

    now = (DEFAULT_AI_CACHE_TTL_SECONDS - 1) * 1000 // just before expiry
    expect(await cache.get('key-1')).not.toBeNull()

    now = (DEFAULT_AI_CACHE_TTL_SECONDS + 1) * 1000
    expect(await cache.get('key-1')).toBeNull()
  })

  it('keeps entries for different keys independent', async () => {
    const cache = createInMemoryAIResponseCache(() => 0)
    await cache.set('a', buildResponse({ content: 'A' }))
    await cache.set('b', buildResponse({ content: 'B' }))

    const hitA = await cache.get('a')
    const hitB = await cache.get('b')

    expect(hitA?.content).toBe('A')
    expect(hitB?.content).toBe('B')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Redis cache
// ─────────────────────────────────────────────────────────────────────────────

describe('createRedisAIResponseCache', () => {
  function buildRedisMock(): {
    client: Redis
    get: ReturnType<typeof vi.fn>
    setex: ReturnType<typeof vi.fn>
  } {
    const get = vi.fn()
    const setex = vi.fn()
    return {
      client: { get, setex } as unknown as Redis,
      get,
      setex,
    }
  }

  it('calls redis.get with the hashed key and returns null when missing', async () => {
    const { client, get } = buildRedisMock()
    get.mockResolvedValue(null)

    const cache = createRedisAIResponseCache(client)
    const result = await cache.get('k')

    expect(result).toBeNull()
    expect(get).toHaveBeenCalledOnce()
    expect(get.mock.calls[0]?.[0]).toBe(buildCacheKey('k'))
  })

  it('parses JSON value and injects cached:true on hit', async () => {
    const { client, get } = buildRedisMock()
    const stored = { ...buildResponse(), cached: false }
    get.mockResolvedValue(JSON.stringify(stored))

    const cache = createRedisAIResponseCache(client)
    const result = await cache.get('k')

    expect(result).not.toBeNull()
    expect(result?.cached).toBe(true)
    expect(result?.content).toBe('hello')
  })

  it('returns null for malformed JSON without throwing', async () => {
    const { client, get } = buildRedisMock()
    get.mockResolvedValue('not-json')

    const cache = createRedisAIResponseCache(client)
    expect(await cache.get('k')).toBeNull()
  })

  it('calls redis.setex with default TTL when ttl is omitted', async () => {
    const { client, setex } = buildRedisMock()
    setex.mockResolvedValue('OK')

    const cache = createRedisAIResponseCache(client)
    await cache.set('k', buildResponse())

    expect(setex).toHaveBeenCalledOnce()
    const [key, ttl, payload] = setex.mock.calls[0] as [string, number, string]
    expect(key).toBe(buildCacheKey('k'))
    expect(ttl).toBe(DEFAULT_AI_CACHE_TTL_SECONDS)
    expect(JSON.parse(payload).cached).toBe(false)
    expect(JSON.parse(payload).content).toBe('hello')
  })

  it('respects a custom defaultTtl from the factory', async () => {
    const { client, setex } = buildRedisMock()
    setex.mockResolvedValue('OK')

    const cache = createRedisAIResponseCache(client, 60)
    await cache.set('k', buildResponse())

    expect(setex.mock.calls[0]?.[1]).toBe(60)
  })

  it('accepts a per-call ttl override', async () => {
    const { client, setex } = buildRedisMock()
    setex.mockResolvedValue('OK')

    const cache = createRedisAIResponseCache(client, 60)
    await cache.set('k', buildResponse(), 10)

    expect(setex.mock.calls[0]?.[1]).toBe(10)
  })
})
