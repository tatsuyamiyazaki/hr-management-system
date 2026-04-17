import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

import { createAnthropicProvider } from '@/lib/ai-gateway/providers/anthropic-provider'
import {
  AIConfigurationError,
  AIProviderError,
  type AIChatRequest,
} from '@/lib/ai-gateway/ai-gateway-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMockClient(overrides: {
  createFn?: ReturnType<typeof vi.fn>
} = {}): { client: Anthropic; createFn: ReturnType<typeof vi.fn> } {
  const createFn =
    overrides.createFn ??
    vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'hello from claude' }],
      usage: { input_tokens: 42, output_tokens: 17 },
    })
  return {
    client: { messages: { create: createFn } } as unknown as Anthropic,
    createFn,
  }
}

function buildRequest(overrides: Partial<AIChatRequest> = {}): AIChatRequest {
  return {
    domain: 'ai-coach',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('createAnthropicProvider', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 各テストで API キー env をクリアして独立性を確保
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws AIConfigurationError when no API key and no client provided', () => {
    expect(() => createAnthropicProvider()).toThrow(AIConfigurationError)
  })

  it('uses injected client when provided (no API key required)', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    expect(provider.name).toBe('claude')

    await provider.chat(buildRequest())
    expect(createFn).toHaveBeenCalledOnce()
  })

  it('accepts an apiKey option without throwing', () => {
    expect(() => createAnthropicProvider({ apiKey: 'sk-test-key' })).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// chat() behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('AnthropicChatProvider.chat', () => {
  it('passes a plain string system prompt by default', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    await provider.chat(
      buildRequest({
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'hi' },
        ],
      }),
    )

    const args = createFn.mock.calls[0]?.[0]
    expect(args.system).toBe('Be helpful.')
    expect(args.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(args.max_tokens).toBeGreaterThan(0)
  })

  it('wraps system with cache_control when enablePromptCache is true', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    await provider.chat(
      buildRequest({
        enablePromptCache: true,
        messages: [
          { role: 'system', content: 'Cached prompt.' },
          { role: 'user', content: 'hi' },
        ],
      }),
    )

    const args = createFn.mock.calls[0]?.[0]
    expect(Array.isArray(args.system)).toBe(true)
    expect(args.system[0]).toMatchObject({
      type: 'text',
      text: 'Cached prompt.',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('omits system when request has no system message', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    await provider.chat(buildRequest({ messages: [{ role: 'user', content: 'hi' }] }))

    const args = createFn.mock.calls[0]?.[0]
    expect(args.system).toBeUndefined()
  })

  it('maps usage.input_tokens / output_tokens into the response', async () => {
    const { client } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    const response = await provider.chat(buildRequest())

    expect(response.content).toBe('hello from claude')
    expect(response.provider).toBe('claude')
    expect(response.usage).toEqual({ promptTokens: 42, completionTokens: 17 })
    expect(response.cached).toBe(false)
  })

  it('applies maxOutputTokens and temperature when provided', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    await provider.chat(
      buildRequest({
        maxOutputTokens: 200,
        temperature: 0.4,
      }),
    )

    const args = createFn.mock.calls[0]?.[0]
    expect(args.max_tokens).toBe(200)
    expect(args.temperature).toBe(0.4)
  })

  it('uses ANTHROPIC_MODEL env var when set', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-test-model'
    const { client, createFn } = buildMockClient()
    const provider = createAnthropicProvider({ client })

    await provider.chat(buildRequest())

    const args = createFn.mock.calls[0]?.[0]
    expect(args.model).toBe('claude-test-model')

    delete process.env.ANTHROPIC_MODEL
  })

  it('wraps API errors in AIProviderError', async () => {
    const createFn = vi.fn().mockRejectedValue(new Error('upstream 500'))
    const { client } = buildMockClient({ createFn })
    const provider = createAnthropicProvider({ client })

    await expect(provider.chat(buildRequest())).rejects.toBeInstanceOf(AIProviderError)
    await expect(provider.chat(buildRequest())).rejects.toThrow(/upstream 500/)
  })

  it('returns empty content when response has no text blocks', async () => {
    const createFn = vi.fn().mockResolvedValue({
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    })
    const { client } = buildMockClient({ createFn })
    const provider = createAnthropicProvider({ client })

    const response = await provider.chat(buildRequest())
    expect(response.content).toBe('')
  })
})
