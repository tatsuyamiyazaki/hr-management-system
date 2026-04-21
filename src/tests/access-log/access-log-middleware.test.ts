import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAccessLogMiddleware } from '@/lib/access-log/access-log-middleware'
import type { NextRequest } from 'next/server'
import type { AccessLogRepository } from '@/lib/access-log/access-log-repository'
import type { StructuredLogger } from '@/lib/monitoring/structured-logger'
import type { SecurityEventRecorderPort } from '@/lib/monitoring/security-monitoring-service'

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockEmit = vi.fn()
const mockNext = vi.fn()
const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockSecurityRecord = vi.fn()

function makeRepository(): AccessLogRepository {
  return {
    insert: mockEmit,
    findMany: vi.fn(),
  } as unknown as AccessLogRepository
}

function makeLogger(): StructuredLogger {
  return {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  }
}

function makeSecurityMonitor(): SecurityEventRecorderPort {
  return {
    record: mockSecurityRecord,
  }
}

function makeRequest(
  options: {
    method?: string
    path?: string
    ip?: string
    userAgent?: string
    userId?: string | null
  } = {},
): NextRequest {
  const url = `http://localhost${options.path ?? '/api/test'}`
  return {
    method: options.method ?? 'GET',
    nextUrl: { pathname: options.path ?? '/api/test' },
    url,
    ip: options.ip ?? '127.0.0.1',
    headers: {
      get: (key: string) => {
        if (key === 'user-agent') return options.userAgent ?? 'TestAgent/1.0'
        if (key === 'x-request-id') return 'req-test-123'
        if (key === 'x-forwarded-for') return options.ip ?? '127.0.0.1'
        return null
      },
    },
  } as unknown as NextRequest
}

function makeResponse(status = 200) {
  return { status } as Response
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createAccessLogMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmit.mockResolvedValue(undefined)
    mockNext.mockResolvedValue(makeResponse(200))
    mockLoggerInfo.mockResolvedValue(undefined)
    mockLoggerError.mockResolvedValue(undefined)
    mockSecurityRecord.mockResolvedValue([])
  })

  it('should call next() and return the response', async () => {
    const middleware = createAccessLogMiddleware(makeRepository())
    const req = makeRequest()
    const response = makeResponse(200)
    mockNext.mockResolvedValue(response)

    const result = await middleware(req, mockNext)

    expect(mockNext).toHaveBeenCalledOnce()
    expect(result).toBe(response)
  })

  it('should record method, path, statusCode, ipAddress, userAgent', async () => {
    const middleware = createAccessLogMiddleware(makeRepository())
    const req = makeRequest({
      method: 'POST',
      path: '/api/users',
      ip: '10.0.0.1',
      userAgent: 'Chrome/100',
    })
    mockNext.mockResolvedValue(makeResponse(201))

    await middleware(req, mockNext)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/users',
        statusCode: 201,
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome/100',
      }),
    )
  })

  it('should record durationMs as a non-negative number', async () => {
    const middleware = createAccessLogMiddleware(makeRepository())
    const req = makeRequest()
    mockNext.mockResolvedValue(makeResponse(200))

    await middleware(req, mockNext)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: expect.any(Number),
      }),
    )
    const recorded = mockEmit.mock.calls[0]![0]
    expect(recorded.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should not throw when repository insert fails (fire-and-forget)', async () => {
    mockEmit.mockRejectedValue(new Error('DB error'))
    const middleware = createAccessLogMiddleware(makeRepository())
    const req = makeRequest()
    mockNext.mockResolvedValue(makeResponse(200))

    await expect(middleware(req, mockNext)).resolves.not.toThrow()
  })

  it('should only log /api/** paths', async () => {
    const middleware = createAccessLogMiddleware(makeRepository())
    const req = makeRequest({ path: '/_next/static/chunk.js' })
    mockNext.mockResolvedValue(makeResponse(200))

    await middleware(req, mockNext)

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('records a RATE_LIMITED security event for 429 responses', async () => {
    const middleware = createAccessLogMiddleware({
      repository: makeRepository(),
      securityMonitor: makeSecurityMonitor(),
    })
    const req = makeRequest({ path: '/api/search' })
    mockNext.mockResolvedValue(makeResponse(429))

    await middleware(req, mockNext)

    expect(mockSecurityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RATE_LIMITED',
        path: '/api/search',
        requestId: 'req-test-123',
        ipAddress: '127.0.0.1',
      }),
    )
  })

  it('sends repository failures to the structured logger', async () => {
    mockEmit.mockRejectedValue(new Error('DB error'))
    const middleware = createAccessLogMiddleware({
      repository: makeRepository(),
      logger: makeLogger(),
    })
    const req = makeRequest({ path: '/api/users' })

    await middleware(req, mockNext)

    expect(mockLoggerError).toHaveBeenCalledWith(
      'access-log.persist_failed',
      'failed to persist access log',
      expect.objectContaining({
        path: '/api/users',
        requestId: 'req-test-123',
      }),
      expect.any(Error),
    )
  })
})
