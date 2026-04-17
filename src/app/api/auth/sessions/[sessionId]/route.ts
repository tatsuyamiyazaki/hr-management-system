/**
 * Task 6.4 / Req 1.15: セッション手動失効 API
 *
 * DELETE /api/auth/sessions/:sessionId
 * - 認証済みユーザーが指定セッションを失効させる
 * - 自分のセッションのみ失効可能 (他ユーザーのセッションは 404)
 * - 成功: 204 No Content
 * - 未所有 / 存在しない: 404
 */
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { SessionNotFoundError } from '@/lib/auth/auth-types'
import { getAuthService } from '@/lib/auth/auth-service-di'

export { setAuthServiceForTesting, clearAuthServiceForTesting } from '@/lib/auth/auth-service-di'

/** UUID 形式を強制してパス・トラバーサル等の不正値を早期排除する */
const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
})

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // next-auth-config.ts の session コールバックがトップレベルに設定する
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawParams = await params
  const parsed = sessionIdParamSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
  }

  const { sessionId } = parsed.data

  // Issue #107: AuthService 未初期化は 503 Service Unavailable として扱い、
  // instrumentation.ts の設定不備が原因であることを伝える (500 よりも安全な手掛かり)。
  let authService: ReturnType<typeof getAuthService>
  try {
    authService = getAuthService()
  } catch {
    return NextResponse.json({ error: 'Auth service not initialized' }, { status: 503 })
  }

  try {
    await authService.revokeSession(userId, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
