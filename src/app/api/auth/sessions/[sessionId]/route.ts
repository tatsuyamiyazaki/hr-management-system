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
import type { AuthService } from '@/lib/auth/auth-service'

/** パスパラメータのバリデーションスキーマ */
const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, 'sessionId must be a non-empty string'),
})

/**
 * 依存注入用ファクトリ。テスト時に差し替え可能。
 * プロダクションでは実際の authService インスタンスを使う。
 */
let _authService: AuthService | null = null

export function setAuthServiceForTesting(svc: AuthService): void {
  _authService = svc
}

function getAuthService(): AuthService {
  if (_authService) return _authService
  throw new Error('AuthService is not configured. Use setAuthServiceForTesting or wire DI.')
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId: string | undefined = (
    serverSession as Record<string, unknown> & { user?: { id?: string } }
  ).user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Zod によるパスパラメータ検証
  const rawParams = await params
  const parsed = sessionIdParamSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
  }

  const { sessionId } = parsed.data

  try {
    const authService = getAuthService()
    await authService.revokeSession(userId, sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
