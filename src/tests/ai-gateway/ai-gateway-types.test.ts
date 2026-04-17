import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDER_NAMES,
  AI_DOMAINS,
  isAIProviderName,
  chatMessageSchema,
  aiChatRequestSchema,
  AIProviderError,
  AITimeoutError,
  AIConfigurationError,
} from '@/lib/ai-gateway/ai-gateway-types'

describe('AI_PROVIDER_NAMES', () => {
  it('contains claude and openai', () => {
    expect(AI_PROVIDER_NAMES).toEqual(['claude', 'openai'])
  })
})

describe('AI_DOMAINS', () => {
  it('contains ai-coach and feedback', () => {
    expect(AI_DOMAINS).toEqual(['ai-coach', 'feedback'])
  })
})

describe('isAIProviderName', () => {
  it('returns true for supported providers', () => {
    expect(isAIProviderName('claude')).toBe(true)
    expect(isAIProviderName('openai')).toBe(true)
  })

  it('returns false for unknown providers or non-string values', () => {
    expect(isAIProviderName('gemini')).toBe(false)
    expect(isAIProviderName('')).toBe(false)
    expect(isAIProviderName(null)).toBe(false)
    expect(isAIProviderName(123)).toBe(false)
    expect(isAIProviderName(undefined)).toBe(false)
  })
})

describe('chatMessageSchema', () => {
  it('accepts a valid message', () => {
    const result = chatMessageSchema.safeParse({ role: 'user', content: 'hello' })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = chatMessageSchema.safeParse({ role: 'user', content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown role', () => {
    const result = chatMessageSchema.safeParse({ role: 'tool', content: 'x' })
    expect(result.success).toBe(false)
  })
})

describe('aiChatRequestSchema', () => {
  it('accepts a minimal valid request', () => {
    const result = aiChatRequestSchema.safeParse({
      domain: 'ai-coach',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty messages array', () => {
    const result = aiChatRequestSchema.safeParse({
      domain: 'feedback',
      messages: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown domain', () => {
    const result = aiChatRequestSchema.safeParse({
      domain: 'unknown',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects temperature out of range', () => {
    const result = aiChatRequestSchema.safeParse({
      domain: 'ai-coach',
      messages: [{ role: 'user', content: 'x' }],
      temperature: 3,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-positive timeoutMs', () => {
    const result = aiChatRequestSchema.safeParse({
      domain: 'ai-coach',
      messages: [{ role: 'user', content: 'x' }],
      timeoutMs: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('Error classes', () => {
  it('AIProviderError captures provider and message', () => {
    const err = new AIProviderError('claude', 'boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AIProviderError')
    expect(err.provider).toBe('claude')
    expect(err.providerMessage).toBe('boom')
    expect(err.message).toContain('claude')
    expect(err.message).toContain('boom')
  })

  it('AITimeoutError captures elapsed ms', () => {
    const err = new AITimeoutError(5000)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AITimeoutError')
    expect(err.elapsedMs).toBe(5000)
  })

  it('AIConfigurationError wraps a message', () => {
    const err = new AIConfigurationError('API key missing')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AIConfigurationError')
    expect(err.message).toBe('API key missing')
  })
})
