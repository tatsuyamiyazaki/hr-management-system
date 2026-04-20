/**
 * Issue #63 / Task 17.4: フィードバックアーカイブスキャン API (Req 10.9)
 *
 * - POST /api/feedback/archive-scan — ADMIN のみ
 *   公開から2年経過したフィードバックを ARCHIVED 状態に変更する
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getFeedbackService } from '@/lib/feedback/feedback-service-di'

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (guard.session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getFeedbackService>
  try {
    svc = getFeedbackService()
  } catch {
    return NextResponse.json({ error: 'Feedback service not initialized' }, { status: 503 })
  }

  try {
    const result = await svc.archiveExpired(new Date())
    return NextResponse.json({ success: true, data: result })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
