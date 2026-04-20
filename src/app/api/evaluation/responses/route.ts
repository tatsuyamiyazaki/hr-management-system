/**
 * Issue #53 / Task 15.4: 評価回答 全体一覧 API (Req 8.17)
 *
 * - GET /api/evaluation/responses?cycleId=... — 全体一覧（HR_MANAGER/ADMIN）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationResponseService } from '@/lib/evaluation/evaluation-response-service-di'

const HR_OR_ADMIN_ROLES = ['HR_MANAGER', 'ADMIN'] as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!HR_OR_ADMIN_ROLES.includes(guard.session.role as (typeof HR_OR_ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cycleId = request.nextUrl.searchParams.get('cycleId')
  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
  }

  let svc: ReturnType<typeof getEvaluationResponseService>
  try {
    svc = getEvaluationResponseService()
  } catch {
    return NextResponse.json(
      { error: 'EvaluationResponse service not initialized' },
      { status: 503 },
    )
  }

  try {
    const responses = await svc.listByCycle(cycleId)
    return NextResponse.json({ success: true, data: responses }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
