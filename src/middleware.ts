import { type NextRequest, NextResponse } from 'next/server'
import { createAccessLogMiddleware } from '@/lib/access-log/access-log-middleware'

const accessLog = createAccessLogMiddleware()

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return accessLog(request, async (req) => {
    // 認証ミドルウェアは後続のタスク（Task 6.1）で実装予定
    // ここでは Next.js のデフォルトレスポンスをそのまま返す
    return NextResponse.next({ request: req })
  }) as Promise<NextResponse>
}

export const config = {
  matcher: ['/api/:path*'],
}
