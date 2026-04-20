/**
 * Issue #65 / Task 18.2: インセンティブスコア取得 API (Req 11.4)
 *
 * - GET /api/incentive/score?cycleId=... — 認証済みユーザーの実施件数と累積スコア
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getIncentiveService } from '@/lib/incentive/incentive-service-di'

export {
  setIncentiveServiceForTesting,
  clearIncentiveServiceForTesting,
} from '@/lib/incentive/incentive-service-di'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const cycleId = request.nextUrl.searchParams.get('cycleId')
  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
  }

  let svc: ReturnType<typeof getIncentiveService>
  try {
    svc = getIncentiveService()
  } catch {
    return NextResponse.json({ error: 'Incentive service not initialized' }, { status: 503 })
  }

  try {
    const score = await svc.getCumulativeScore(guard.session.userId, cycleId)
    return NextResponse.json({ success: true, data: score }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
