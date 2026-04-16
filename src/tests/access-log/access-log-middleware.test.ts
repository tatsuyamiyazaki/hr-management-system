import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAccessLogMiddleware } from '@/lib/access-log/access-log-middleware'
import type { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockEmit = vi.fn()
const mockNext = vi.fn()

vi.mock('@/lib/access-log/access-log-repository', () => ({
  createAccessLogRepository: vi.fn(() => ({
    insert: mockEmit,
  })),
}))

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
  })

  it('should call next() and return the response', async () => {
    const middleware = createAccessLogMiddleware()
    const req = makeRequest()
    const response = makeResponse(200)
    mockNext.mockResolvedValue(response)

    const result = await middleware(req, mockNext)

    expect(mockNext).toHaveBeenCalledOnce()
    expect(result).toBe(response)
  })

  it('should record method, path, statusCode, ipAddress, userAgent', async () => {
    const middleware = createAccessLogMiddleware()
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
    const middleware = createAccessLogMiddleware()
    const req = makeRequest()
    mockNext.mockResolvedValue(makeResponse(200))

    await middleware(req, mockNext)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: expect.any(Number),
      }),
    )
    const recorded = mockEmit.mock.calls[0]?.[0]
    expect(recorded?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should not throw when repository insert fails (fire-and-forget)', async () => {
    mockEmit.mockRejectedValue(new Error('DB error'))
    const middleware = createAccessLogMiddleware()
    const req = makeRequest()
    mockNext.mockResolvedValue(makeResponse(200))

    await expect(middleware(req, mockNext)).resolves.not.toThrow()
  })

  it('should only log /api/** paths', async () => {
    const middleware = createAccessLogMiddleware()
    const req = makeRequest({ path: '/_next/static/chunk.js' })
    mockNext.mockResolvedValue(makeResponse(200))

    await middleware(req, mockNext)

    expect(mockEmit).not.toHaveBeenCalled()
  })
})
