import { describe, it, expect } from 'vitest'
import {
  aiUsageEntrySchema,
  aiUsageFailureSchema,
  AI_USAGE_ERROR_CATEGORIES,
  InvalidYearMonthError,
} from '@/lib/ai-monitoring/ai-usage-types'

// ─────────────────────────────────────────────────────────────────────────────
// aiUsageEntrySchema
// ─────────────────────────────────────────────────────────────────────────────

describe('aiUsageEntrySchema', () => {
  const base = {
    userId: 'user-1',
    domain: 'ai-coach' as const,
    provider: 'claude' as const,
    promptTokens: 100,
    completionTokens: 50,
    estimatedCostUsd: 0.0012,
    latencyMs: 300,
    cacheHit: false,
    requestId: 'req-1',
    createdAt: new Date('2026-04-17T00:00:00Z'),
  }

  it('accepts a valid entry', () => {
    const result = aiUsageEntrySchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('accepts cacheHit=true with 0 latency', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, cacheHit: true, latencyMs: 0 })
    expect(result.success).toBe(true)
  })

  it('rejects empty userId', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, userId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects negative tokens', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, promptTokens: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects negative cost', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, estimatedCostUsd: -0.01 })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer tokens', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, completionTokens: 1.5 })
    expect(result.success).toBe(false)
  })

  it('rejects unknown domain', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, domain: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown provider', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, provider: 'gemini' })
    expect(result.success).toBe(false)
  })

  it('rejects empty requestId', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, requestId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects non-Date createdAt', () => {
    const result = aiUsageEntrySchema.safeParse({ ...base, createdAt: '2026-04-17' })
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// aiUsageFailureSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('aiUsageFailureSchema', () => {
  const base = {
    userId: 'user-1',
    domain: 'feedback' as const,
    provider: 'openai' as const,
    attemptCount: 2,
    errorCategory: 'TIMEOUT' as const,
    latencyMs: 5000,
    requestId: 'req-2',
    createdAt: new Date('2026-04-17T12:00:00Z'),
  }

  it('accepts a valid failure', () => {
    const result = aiUsageFailureSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('rejects attemptCount = 0', () => {
    const result = aiUsageFailureSchema.safeParse({ ...base, attemptCount: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects unknown errorCategory', () => {
    const result = aiUsageFailureSchema.safeParse({ ...base, errorCategory: 'SOMETHING' })
    expect(result.success).toBe(false)
  })

  it('accepts all defined error categories', () => {
    for (const category of AI_USAGE_ERROR_CATEGORIES) {
      const result = aiUsageFailureSchema.safeParse({ ...base, errorCategory: category })
      expect(result.success).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// InvalidYearMonthError
// ─────────────────────────────────────────────────────────────────────────────

describe('InvalidYearMonthError', () => {
  it('sets name and input', () => {
    const err = new InvalidYearMonthError('2026/04')
    expect(err.name).toBe('InvalidYearMonthError')
    expect(err.input).toBe('2026/04')
    expect(err.message).toContain('2026/04')
    expect(err).toBeInstanceOf(Error)
  })
})
