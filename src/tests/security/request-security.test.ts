import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  applySecurityHeaders,
  createHttpsRedirectResponse,
  enforceRateLimits,
  InMemoryRequestRateLimiter,
  shouldRedirectToHttps,
} from '@/lib/security/request-security'

function makeRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(url, init)
}

describe('request security helpers', () => {
  it('http production request is redirected to https', () => {
    const request = makeRequest('http://example.com/api/users', {
      headers: { 'x-forwarded-proto': 'http' },
    })

    expect(shouldRedirectToHttps(request)).toBe(true)

    const response = createHttpsRedirectResponse(request)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://example.com/api/users')
  })

  it('localhost request is not redirected', () => {
    const request = makeRequest('http://localhost:3000/api/users', {
      headers: { 'x-forwarded-proto': 'http' },
    })

    expect(shouldRedirectToHttps(request)).toBe(false)
  })

  it('adds security headers to response', () => {
    const response = applySecurityHeaders(NextResponse.next())

    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('enforces login specific rate limit before generic api limit', () => {
    const limiter = new InMemoryRequestRateLimiter(() => 1_000_000)
    const request = makeRequest('https://example.com/api/auth/sessions', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    for (let i = 0; i < 10; i++) {
      expect(enforceRateLimits(request, limiter)).toBeNull()
    }

    const blocked = enforceRateLimits(request, limiter)
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('X-RateLimit-Bucket')).toBe('login')
  })

  it('enforces export specific rate limit', () => {
    const limiter = new InMemoryRequestRateLimiter(() => 2_000_000)
    const request = makeRequest('https://example.com/api/dashboard/export', {
      headers: { 'x-forwarded-for': '203.0.113.20' },
      method: 'POST',
    })

    for (let i = 0; i < 5; i++) {
      expect(enforceRateLimits(request, limiter)).toBeNull()
    }

    const blocked = enforceRateLimits(request, limiter)
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('X-RateLimit-Bucket')).toBe('export')
    expect(blocked?.headers.get('Retry-After')).toBeTruthy()
  })
})
