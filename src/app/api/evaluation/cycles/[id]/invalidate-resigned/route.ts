/**
 * Issue #56 / Task 15.7: 退職者評価依頼無効化 API (Req 8.19)
 *
 * - POST /api/evaluation/cycles/[id]/invalidate-resigned — HR_MANAGER/ADMIN のみ
 *   退職日が設定された被評価者の ACTIVE な割り当てを無効化（DECLINED）する
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getCycleAggregationService } from '@/lib/evaluation/cycle-aggregation-service-di'
import { CycleAggregationNotFoundError } from '@/lib/evaluation/cycle-aggregation-types'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let svc: ReturnType<typeof getCycleAggregationService>
  try {
    svc = getCycleAggregationService()
  } catch {
    return NextResponse.json({ error: 'CycleAggregation service not initialized' }, { status: 503 })
  }

  try {
    const result = await svc.invalidateResignedAssignments(id)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof CycleAggregationNotFoundError) {
      return NextResponse.json({ error: 'ReviewCycle not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
