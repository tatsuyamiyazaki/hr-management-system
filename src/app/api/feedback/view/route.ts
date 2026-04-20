/**
 * Issue #63 / Task 17.4: フィードバック閲覧確認 API (Req 10.7)
 *
 * - POST /api/feedback/view — 認証済みユーザーが確認日時を記録する
 *   body: { cycleId: string; subjectId: string }
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getFeedbackService } from '@/lib/feedback/feedback-service-di'
import { FeedbackNotFoundError, FeedbackInvalidStatusError } from '@/lib/feedback/feedback-service'

export {
  setFeedbackServiceForTesting,
  clearFeedbackServiceForTesting,
} from '@/lib/feedback/feedback-service-di'

const bodySchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { cycleId, subjectId } = parsed.data

  // 本人確認: subjectId が自分自身であること
  if (subjectId !== guard.session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getFeedbackService>
  try {
    svc = getFeedbackService()
  } catch {
    return NextResponse.json({ error: 'Feedback service not initialized' }, { status: 503 })
  }

  try {
    await svc.recordView(cycleId, subjectId)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof FeedbackNotFoundError) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })
    }
    if (err instanceof FeedbackInvalidStatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
