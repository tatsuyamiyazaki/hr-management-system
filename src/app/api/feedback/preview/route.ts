/**
 * Issue #55 / Task 17.3: HR_MANAGER フィードバックプレビュー API (Req 10.4)
 *
 * - GET /api/feedback/preview?cycleId=X&subjectId=Y — 変換後フィードバックのプレビュー取得
 * - HR_MANAGER / ADMIN のみアクセス可能
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getFeedbackService } from '@/lib/feedback/feedback-service-di'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 認証チェック
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sess = session as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  if (!role || !HR_OR_ADMIN_ROLES.includes(role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // クエリパラメータ取得
  const { searchParams } = new URL(request.url)
  const cycleId = searchParams.get('cycleId')
  const subjectId = searchParams.get('subjectId')

  if (!cycleId || !subjectId) {
    return NextResponse.json(
      { error: 'cycleId and subjectId are required' },
      { status: 400 },
    )
  }

  let svc: ReturnType<typeof getFeedbackService>
  try {
    svc = getFeedbackService()
  } catch {
    return NextResponse.json({ error: 'Feedback service not initialized' }, { status: 503 })
  }

  const preview = await svc.previewTransformed(cycleId, subjectId)
  if (!preview) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: preview })
}
