/**
 * Issue #41 / Req 5.5: キャリア希望集計ダッシュボード API
 *
 * - GET /api/career/aggregate/dashboard — HR_MANAGER / ADMIN のみ
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getCareerAggregateService } from '@/lib/career/career-aggregate-service-di'

const ALLOWED_ROLES: readonly string[] = ['HR_MANAGER', 'ADMIN']

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!ALLOWED_ROLES.includes(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getCareerAggregateService>
  try {
    svc = getCareerAggregateService()
  } catch {
    return NextResponse.json({ error: 'CareerAggregate service not initialized' }, { status: 503 })
  }

  try {
    const dashboard = await svc.getDashboard()
    return NextResponse.json({ success: true, data: dashboard })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
