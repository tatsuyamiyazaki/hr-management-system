import type { NextRequest } from 'next/server'
import type { AccessLogRepository } from './access-log-repository'

// Edge Runtime では Prisma 非対応のため no-op をデフォルトとする
// Node.js ルートから使う場合は createAccessLogRepository() を注入すること
const noopRepository: AccessLogRepository = {
  insert: () => Promise.resolve(),
  findMany: () => Promise.resolve({ data: [], total: 0 }),
}

type NextFn = (req: NextRequest) => Promise<Response>

export interface AccessLogMiddleware {
  (req: NextRequest, next: NextFn): Promise<Response>
}

function extractIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function extractRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID()
}

/**
 * アクセスログミドルウェア
 * /api/** パスのみ記録し、fire-and-forget で非同期に書き込む（Requirement 17.6）
 */
export function createAccessLogMiddleware(repo?: AccessLogRepository): AccessLogMiddleware {
  const repository = repo ?? noopRepository

  return async (req: NextRequest, next: NextFn): Promise<Response> => {
    const path = req.nextUrl.pathname

    // /api/** パスのみ記録対象
    if (!path.startsWith('/api/')) {
      return next(req)
    }

    const start = Date.now()
    const response = await next(req)
    const durationMs = Date.now() - start

    // fire-and-forget — ログ失敗がリクエストに影響しないようにする
    repository
      .insert({
        method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
        path,
        statusCode: response.status,
        durationMs,
        ipAddress: extractIp(req),
        userAgent: req.headers.get('user-agent') ?? 'unknown',
        userId: null, // 認証ミドルウェアで設定するため初期値は null
        requestId: extractRequestId(req),
      })
      .catch(() => {
        // ログ書き込み失敗は無視（本番では structured logger に転送する）
      })

    return response
  }
}
