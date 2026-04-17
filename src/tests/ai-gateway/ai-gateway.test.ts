import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createAIGateway } from '@/lib/ai-gateway/ai-gateway'
import { createInMemoryAIResponseCache } from '@/lib/ai-gateway/ai-response-cache'
import {
  AIProviderError,
  AITimeoutError,
  type AIChatRequest,
  type AIChatResponse,
} from '@/lib/ai-gateway/ai-gateway-types'
import type { ChatProvider } from '@/lib/ai-gateway/chat-provider'

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function buildProvider(
  overrides: {
    name?: 'claude' | 'openai'
    chatFn?: ReturnType<typeof vi.fn>
  } = {},
): { provider: ChatProvider; chatFn: ReturnType<typeof vi.fn> } {
  const chatFn =
    overrides.chatFn ??
    vi.fn().mockResolvedValue({
      content: 'hi from fake',
      provider: overrides.name ?? 'claude',
      usage: { promptTokens: 5, completionTokens: 3 },
      cached: false,
    } satisfies AIChatResponse)

  const provider: ChatProvider = {
    name: overrides.name ?? 'claude',
    chat: chatFn as unknown as ChatProvider['chat'],
  }
  return { provider, chatFn }
}

function buildRequest(overrides: Partial<AIChatRequest> = {}): AIChatRequest {
  return {
    domain: 'ai-coach',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway.getCurrentProvider', () => {
  it('returns the provider name', () => {
    const { provider } = buildProvider({ name: 'openai' })
    const gateway = createAIGateway({
      provider,
      cache: createInMemoryAIResponseCache(() => 0),
    })
    expect(gateway.getCurrentProvider()).toBe('openai')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway.chat — validation', () => {
  it('rejects requests that fail Zod validation', async () => {
    const { provider } = buildProvider()
    const gateway = createAIGateway({
      provider,
      cache: createInMemoryAIResponseCache(() => 0),
    })

    await expect(
      gateway.chat({
        // @ts-expect-error intentional invalid input
        domain: 'unknown-domain',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cache behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway.chat — caching', () => {
  it('calls provider on miss, stores the response, and emits onUsage', async () => {
    const { provider, chatFn } = buildProvider()
    const cache = createInMemoryAIResponseCache(() => 0)
    const onUsage = vi.fn()

    const gateway = createAIGateway({ provider, cache, onUsage })

    const response = await gateway.chat(buildRequest())

    expect(chatFn).toHaveBeenCalledOnce()
    expect(response.content).toBe('hi from fake')
    expect(response.cached).toBe(false)
    expect(onUsage).toHaveBeenCalledOnce()
    expect(onUsage.mock.calls[0]?.[0]).toMatchObject({
      domain: 'ai-coach',
      provider: 'claude',
      cached: false,
      promptTokens: 5,
      completionTokens: 3,
    })
  })

  it('returns cached response without calling provider on hit', async () => {
    const { provider, chatFn } = buildProvider()
    const cache = createInMemoryAIResponseCache(() => 0)
    const onUsage = vi.fn()
    const gateway = createAIGateway({ provider, cache, onUsage })

    const req = buildRequest()
    const first = await gateway.chat(req)
    expect(first.cached).toBe(false)

    const second = await gateway.chat(req)
    expect(second.cached).toBe(true)
    expect(second.content).toBe('hi from fake')
    expect(chatFn).toHaveBeenCalledOnce() // only the first call hit the provider
    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage.mock.calls[1]?.[0].cached).toBe(true)
  })

  it('treats different domains as different cache entries', async () => {
    const { provider, chatFn } = buildProvider()
    const cache = createInMemoryAIResponseCache(() => 0)
    const gateway = createAIGateway({ provider, cache })

    await gateway.chat(buildRequest({ domain: 'ai-coach' }))
    await gateway.chat(buildRequest({ domain: 'feedback' }))

    expect(chatFn).toHaveBeenCalledTimes(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Timeout
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway.chat — timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects with AITimeoutError when provider exceeds defaultTimeoutMs', async () => {
    // Provider never resolves; only the gateway's internal timer should fire
    const chatFn = vi.fn().mockImplementation(() => new Promise<AIChatResponse>(() => {}))
    const { provider } = buildProvider({ chatFn })
    const cache = createInMemoryAIResponseCache(() => 0)
    const gateway = createAIGateway({
      provider,
      cache,
      defaultTimeoutMs: 1000,
    })

    const pending = gateway.chat(buildRequest())
    // ハンドラを先に attach して未捕捉 rejection を防ぐ
    const assertion = expect(pending).rejects.toBeInstanceOf(AITimeoutError)

    await vi.advanceTimersByTimeAsync(1500)
    await assertion
  })

  it('honours per-request timeoutMs', async () => {
    const chatFn = vi.fn().mockImplementation(() => new Promise<AIChatResponse>(() => {}))
    const { provider } = buildProvider({ chatFn })
    const cache = createInMemoryAIResponseCache(() => 0)
    const gateway = createAIGateway({
      provider,
      cache,
      defaultTimeoutMs: 10_000,
    })

    const pending = gateway.chat(buildRequest({ timeoutMs: 500 }))
    const assertion = expect(pending).rejects.toBeInstanceOf(AITimeoutError)

    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway.chat — errors', () => {
  it('propagates AIProviderError thrown by the provider', async () => {
    const chatFn = vi.fn().mockRejectedValue(new AIProviderError('claude', 'boom'))
    const { provider } = buildProvider({ chatFn })
    const gateway = createAIGateway({
      provider,
      cache: createInMemoryAIResponseCache(() => 0),
    })

    await expect(gateway.chat(buildRequest())).rejects.toBeInstanceOf(AIProviderError)
  })

  it('normalises generic Errors into AIProviderError', async () => {
    const chatFn = vi.fn().mockRejectedValue(new Error('unexpected'))
    const { provider } = buildProvider({ chatFn })
    const gateway = createAIGateway({
      provider,
      cache: createInMemoryAIResponseCache(() => 0),
    })

    const promise = gateway.chat(buildRequest())
    await expect(promise).rejects.toBeInstanceOf(AIProviderError)
    await expect(promise).rejects.toThrow(/unexpected/)
  })

  it('does not fail the call when onUsage itself throws', async () => {
    const { provider } = buildProvider()
    const cache = createInMemoryAIResponseCache(() => 0)
    const onUsage = vi.fn().mockRejectedValue(new Error('logger down'))

    const gateway = createAIGateway({ provider, cache, onUsage })

    const response = await gateway.chat(buildRequest())
    expect(response.content).toBe('hi from fake')
    expect(onUsage).toHaveBeenCalled()
  })
})
