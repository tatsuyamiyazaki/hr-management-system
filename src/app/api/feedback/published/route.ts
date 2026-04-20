/**
 * Issue #55 / Task 17.3: 被評価者向け公開フィードバック取得 API (Req 10.6)
 *
 * - GET /api/feedback/published — 認証済みユーザーの公開済みフィードバック一覧
 * - evaluatorId は DTO に含まれない（匿名閲覧）
 */
import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getFeedbackService } from '@/lib/feedback/feedback-service-di'

export async function GET(): Promise<NextResponse> {
  // 認証チェック
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sess = session as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let svc: ReturnType<typeof getFeedbackService>
  try {
    svc = getFeedbackService()
  } catch {
    return NextResponse.json({ error: 'Feedback service not initialized' }, { status: 503 })
  }

  const published = await svc.getPublishedFor(userId)
  return NextResponse.json({ success: true, data: published })
}
