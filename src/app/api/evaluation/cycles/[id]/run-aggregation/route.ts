/**
 * Issue #56 / Task 15.7: 評価サイクル集計実行 API (Req 8.13, 8.14, 8.15)
 *
 * - POST /api/evaluation/cycles/[id]/run-aggregation — HR_MANAGER/ADMIN のみ
 *   AGGREGATING 状態のサイクルの全回答を集計してスコアと匿名コメントを返す
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getCycleAggregationService } from '@/lib/evaluation/cycle-aggregation-service-di'
import {
  CycleAggregationNotFoundError,
  CycleAggregationInvalidStatusError,
} from '@/lib/evaluation/cycle-aggregation-types'

export {
  setCycleAggregationServiceForTesting,
  clearCycleAggregationServiceForTesting,
} from '@/lib/evaluation/cycle-aggregation-service-di'

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
    const result = await svc.aggregateCycle(id)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof CycleAggregationNotFoundError) {
      return NextResponse.json({ error: 'ReviewCycle not found' }, { status: 404 })
    }
    if (err instanceof CycleAggregationInvalidStatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
