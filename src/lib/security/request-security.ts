import { NextResponse, type NextRequest } from 'next/server'

export interface RateLimitResult {
  readonly allowed: boolean
  readonly remaining: number
  readonly retryAfterSec: number
}

export interface RateLimitBucket {
  readonly key: string
  readonly limit: number
  readonly windowSec: number
}

interface WindowEntry {
  timestamps: number[]
}

export class InMemoryRequestRateLimiter {
  private readonly store = new Map<string, WindowEntry>()

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  check(bucket: RateLimitBucket): RateLimitResult {
    const now = this.nowFn()
    const windowStart = now - bucket.windowSec * 1000
    const storeKey = `${bucket.key}:${bucket.limit}:${bucket.windowSec}`

    let entry = this.store.get(storeKey)
    if (!entry) {
      entry = { timestamps: [] }
      this.store.set(storeKey, entry)
    }

    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > windowStart)

    if (entry.timestamps.length >= bucket.limit) {
      const oldest = entry.timestamps[0] ?? now
      const retryAfterMs = oldest + bucket.windowSec * 1000 - now
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      }
    }

    entry.timestamps.push(now)
    return {
      allowed: true,
      remaining: bucket.limit - entry.timestamps.length,
      retryAfterSec: 0,
    }
  }
}

interface RateLimitRule {
  readonly name: 'api' | 'login' | 'ai' | 'search' | 'export'
  readonly matcher: (request: NextRequest) => boolean
  readonly limit: number
  readonly windowSec: number
  readonly key: (request: NextRequest) => string
}

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')
}

function matchesPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix))
}

const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  {
    name: 'login',
    matcher: (request) =>
      request.nextUrl.pathname.startsWith('/api/auth/') || request.nextUrl.pathname === '/api/auth',
    limit: 10,
    windowSec: 60,
    key: (request) => `login:${extractClientIp(request)}`,
  },
  {
    name: 'ai',
    matcher: (request) => request.nextUrl.pathname.startsWith('/api/evaluation/ai-coach/'),
    limit: 20,
    windowSec: 60,
    key: (request) => `ai:${extractClientIp(request)}`,
  },
  {
    name: 'search',
    matcher: (request) =>
      matchesPath(request.nextUrl.pathname, ['/api/career/map/', '/api/skills/post-candidates']),
    limit: 60,
    windowSec: 60,
    key: (request) => `search:${extractClientIp(request)}`,
  },
  {
    name: 'export',
    matcher: (request) =>
      matchesPath(request.nextUrl.pathname, [
        '/api/dashboard/export',
        '/api/organization/export',
        '/api/masters/',
      ]) && request.nextUrl.pathname.endsWith('/export'),
    limit: 5,
    windowSec: 60,
    key: (request) => `export:${extractClientIp(request)}`,
  },
  {
    name: 'api',
    matcher: (request) => request.nextUrl.pathname.startsWith('/api/'),
    limit: 100,
    windowSec: 60,
    key: (request) => `api:${extractClientIp(request)}`,
  },
]

export function shouldRedirectToHttps(request: NextRequest): boolean {
  const proto =
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return proto === 'http' && !isLocalhost(request.nextUrl.hostname)
}

export function createHttpsRedirectResponse(request: NextRequest): NextResponse {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.protocol = 'https:'
  return NextResponse.redirect(redirectUrl, 308)
}

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none';",
  )
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export function enforceRateLimits(
  request: NextRequest,
  limiter: InMemoryRequestRateLimiter,
): NextResponse | null {
  let maxRetryAfter = 0

  for (const rule of RATE_LIMIT_RULES) {
    if (!rule.matcher(request)) {
      continue
    }

    const result = limiter.check({
      key: rule.key(request),
      limit: rule.limit,
      windowSec: rule.windowSec,
    })
    if (result.allowed) {
      continue
    }

    maxRetryAfter = Math.max(maxRetryAfter, result.retryAfterSec)
    const response = NextResponse.json(
      {
        error: 'Too Many Requests',
        bucket: rule.name,
        retryAfterSec: maxRetryAfter,
      },
      { status: 429 },
    )
    response.headers.set('Retry-After', String(maxRetryAfter))
    response.headers.set('X-RateLimit-Bucket', rule.name)
    return response
  }

  return null
}
