/**
 * Issue #53 / Task 15.4: 評価回答 自分の評価一覧 API (Req 8.5, 8.6)
 *
 * - GET /api/evaluation/responses/mine?cycleId=... — 自分の評価一覧（認証済み）
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getEvaluationResponseService } from '@/lib/evaluation/evaluation-response-service-di'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

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
    const responses = await svc.listMyResponses(guard.session.userId, cycleId)
    return NextResponse.json({ success: true, data: responses }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
