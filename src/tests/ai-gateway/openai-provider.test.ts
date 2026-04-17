import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type OpenAI from 'openai'

import { createOpenAIProvider } from '@/lib/ai-gateway/providers/openai-provider'
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
} = {}): { client: OpenAI; createFn: ReturnType<typeof vi.fn> } {
  const createFn =
    overrides.createFn ??
    vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'hello from openai' } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    })
  return {
    client: {
      chat: { completions: { create: createFn } },
    } as unknown as OpenAI,
    createFn,
  }
}

function buildRequest(overrides: Partial<AIChatRequest> = {}): AIChatRequest {
  return {
    domain: 'feedback',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('createOpenAIProvider', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws AIConfigurationError when no API key and no client provided', () => {
    expect(() => createOpenAIProvider()).toThrow(AIConfigurationError)
  })

  it('uses injected client when provided (no API key required)', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createOpenAIProvider({ client })

    expect(provider.name).toBe('openai')

    await provider.chat(buildRequest())
    expect(createFn).toHaveBeenCalledOnce()
  })

  it('accepts an apiKey option without throwing', () => {
    expect(() => createOpenAIProvider({ apiKey: 'sk-openai-test' })).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// chat() behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('OpenAIChatProvider.chat', () => {
  it('forwards messages as-is including system role', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createOpenAIProvider({ client })

    await provider.chat(
      buildRequest({
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'hi' },
        ],
      }),
    )

    const args = createFn.mock.calls[0]?.[0]
    expect(args.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('maps usage.prompt_tokens / completion_tokens into the response', async () => {
    const { client } = buildMockClient()
    const provider = createOpenAIProvider({ client })

    const response = await provider.chat(buildRequest())

    expect(response.content).toBe('hello from openai')
    expect(response.provider).toBe('openai')
    expect(response.usage).toEqual({ promptTokens: 11, completionTokens: 7 })
    expect(response.cached).toBe(false)
  })

  it('applies maxOutputTokens as max_completion_tokens and temperature', async () => {
    const { client, createFn } = buildMockClient()
    const provider = createOpenAIProvider({ client })

    await provider.chat(
      buildRequest({ maxOutputTokens: 300, temperature: 0.2 }),
    )

    const args = createFn.mock.calls[0]?.[0]
    expect(args.max_completion_tokens).toBe(300)
    expect(args.temperature).toBe(0.2)
  })

  it('uses OPENAI_MODEL env var when set', async () => {
    process.env.OPENAI_MODEL = 'gpt-test-model'
    const { client, createFn } = buildMockClient()
    const provider = createOpenAIProvider({ client })

    await provider.chat(buildRequest())

    expect(createFn.mock.calls[0]?.[0].model).toBe('gpt-test-model')

    delete process.env.OPENAI_MODEL
  })

  it('wraps API errors in AIProviderError', async () => {
    const createFn = vi.fn().mockRejectedValue(new Error('openai down'))
    const { client } = buildMockClient({ createFn })
    const provider = createOpenAIProvider({ client })

    await expect(provider.chat(buildRequest())).rejects.toBeInstanceOf(AIProviderError)
    await expect(provider.chat(buildRequest())).rejects.toThrow(/openai down/)
  })

  it('returns empty content when choices is empty', async () => {
    const createFn = vi.fn().mockResolvedValue({
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
    })
    const { client } = buildMockClient({ createFn })
    const provider = createOpenAIProvider({ client })

    const response = await provider.chat(buildRequest())
    expect(response.content).toBe('')
  })

  it('returns empty content when message.content is null', async () => {
    const createFn = vi.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
    })
    const { client } = buildMockClient({ createFn })
    const provider = createOpenAIProvider({ client })

    const response = await provider.chat(buildRequest())
    expect(response.content).toBe('')
  })
})
