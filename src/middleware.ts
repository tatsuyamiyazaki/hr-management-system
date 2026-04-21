import { type NextRequest, NextResponse } from 'next/server'
import { createAccessLogMiddleware } from '@/lib/access-log/access-log-middleware'
import {
  applySecurityHeaders,
  createHttpsRedirectResponse,
  enforceRateLimits,
  InMemoryRequestRateLimiter,
  shouldRedirectToHttps,
} from '@/lib/security/request-security'

const accessLog = createAccessLogMiddleware()
const rateLimiter = new InMemoryRequestRateLimiter()

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (shouldRedirectToHttps(request)) {
    return applySecurityHeaders(createHttpsRedirectResponse(request))
  }

  const rateLimited = enforceRateLimits(request, rateLimiter)
  if (rateLimited) {
    return applySecurityHeaders(rateLimited)
  }

  const response = (await accessLog(request, async (req) => {
    return NextResponse.next({ request: req })
  })) as NextResponse

  return applySecurityHeaders(response)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
