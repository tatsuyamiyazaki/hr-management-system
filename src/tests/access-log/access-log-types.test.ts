import { describe, it, expect } from 'vitest'
import { accessLogEntrySchema, accessLogQuerySchema } from '@/lib/access-log/access-log-types'

describe('accessLogEntrySchema', () => {
  it('should validate a correct entry', () => {
    const result = accessLogEntrySchema.safeParse({
      method: 'GET',
      path: '/api/users',
      statusCode: 200,
      durationMs: 123,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      userId: 'user-1',
      requestId: 'req-abc123',
    })
    expect(result.success).toBe(true)
  })

  it('should accept null userId for unauthenticated requests', () => {
    const result = accessLogEntrySchema.safeParse({
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 401,
      durationMs: 50,
      ipAddress: '10.0.0.1',
      userAgent: 'curl/7.0',
      userId: null,
      requestId: 'req-xyz',
    })
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const result = accessLogEntrySchema.safeParse({
      method: 'GET',
      // missing path, statusCode, etc.
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid HTTP method', () => {
    const result = accessLogEntrySchema.safeParse({
      method: 'INVALID',
      path: '/api/users',
      statusCode: 200,
      durationMs: 10,
      ipAddress: '127.0.0.1',
      userAgent: 'Test',
      userId: null,
      requestId: 'req-1',
    })
    expect(result.success).toBe(false)
  })

  it('should reject negative durationMs', () => {
    const result = accessLogEntrySchema.safeParse({
      method: 'GET',
      path: '/api/users',
      statusCode: 200,
      durationMs: -1,
      ipAddress: '127.0.0.1',
      userAgent: 'Test',
      userId: null,
      requestId: 'req-1',
    })
    expect(result.success).toBe(false)
  })
})

describe('accessLogQuerySchema', () => {
  it('should validate query with all optional filters', () => {
    const result = accessLogQuerySchema.safeParse({
      userId: 'user-1',
      path: '/api/users',
      statusCode: 200,
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      page: 1,
      limit: 50,
    })
    expect(result.success).toBe(true)
  })

  it('should use defaults when no filters provided', () => {
    const result = accessLogQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(20)
    }
  })

  it('should reject limit greater than 100', () => {
    const result = accessLogQuerySchema.safeParse({ limit: 101 })
    expect(result.success).toBe(false)
  })
})
