/**
 * Issue #51 / Task 15.2: 360度評価サイクル 個別取得 API (Req 8.1, 8.2)
 *
 * - GET /api/evaluation/cycles/[id] — 個別取得（認証済み全員）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getReviewCycleService } from '@/lib/evaluation/review-cycle-service-di'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id } = await params

  let svc: ReturnType<typeof getReviewCycleService>
  try {
    svc = getReviewCycleService()
  } catch {
    return NextResponse.json({ error: 'ReviewCycle service not initialized' }, { status: 503 })
  }

  try {
    const cycle = await svc.getCycle(id)
    if (!cycle) {
      return NextResponse.json({ error: 'ReviewCycle not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: cycle })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
