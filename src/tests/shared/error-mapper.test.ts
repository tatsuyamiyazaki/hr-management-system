/**
 * Task 1.4: DomainError → HTTP ステータス・API エラーコードマッパーのテスト
 */
import { describe, it, expect } from 'vitest'

describe('domainErrorToHttpStatus', () => {
  it('ValidationError → 400', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'ValidationError', field: 'f', message: 'm' })).toBe(400)
  })

  it('Unauthorized → 401', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'Unauthorized', reason: 'NO_SESSION' })).toBe(401)
  })

  it('AccountLocked → 401', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'AccountLocked', unlockAt: new Date() })).toBe(401)
  })

  it('Forbidden → 403', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'Forbidden', reason: '権限不足' })).toBe(403)
  })

  it('NotFound → 404', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'NotFound', resource: 'User', id: '1' })).toBe(404)
  })

  it('Conflict → 409', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'Conflict', detail: '競合' })).toBe(409)
  })

  it('RateLimited → 429', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'RateLimited', retryAfterSec: 60 })).toBe(429)
  })

  it('AITimeout → 503', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'AITimeout', elapsedMs: 6000 })).toBe(503)
  })

  it('CyclicReference → 422', async () => {
    const { domainErrorToHttpStatus } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToHttpStatus({ _tag: 'CyclicReference', path: ['A', 'B'] })).toBe(422)
  })
})

describe('domainErrorToApiCode', () => {
  it('ValidationError → VALIDATION_ERROR', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'ValidationError', field: 'f', message: 'm' })).toBe('VALIDATION_ERROR')
  })

  it('Unauthorized → UNAUTHORIZED', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'Unauthorized', reason: 'EXPIRED' })).toBe('UNAUTHORIZED')
  })

  it('Forbidden → FORBIDDEN', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'Forbidden', reason: '権限不足' })).toBe('FORBIDDEN')
  })

  it('NotFound → NOT_FOUND', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'NotFound', resource: 'User', id: '1' })).toBe('NOT_FOUND')
  })

  it('Conflict → CONFLICT', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'Conflict', detail: '競合' })).toBe('CONFLICT')
  })

  it('RateLimited → RATE_LIMITED', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'RateLimited', retryAfterSec: 60 })).toBe('RATE_LIMITED')
  })

  it('AITimeout → AI_TIMEOUT', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'AITimeout', elapsedMs: 6000 })).toBe('AI_TIMEOUT')
  })

  it('AIQuotaExceeded → AI_QUOTA_EXCEEDED', async () => {
    const { domainErrorToApiCode } = await import('@/lib/shared/error-mapper')
    expect(domainErrorToApiCode({ _tag: 'AIQuotaExceeded', currentUsagePct: 101 })).toBe('AI_QUOTA_EXCEEDED')
  })
})
