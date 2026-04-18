/**
 * Issue #37 / Req 4.1: 組織スキルサマリ API
 *
 * GET /api/skill-analytics/summary
 *   - HR_MANAGER / ADMIN のみ
 *   - 組織全体の SkillSummary を返す
 */
import { NextResponse } from 'next/server'
import { requireHrManager } from '@/lib/organization/organization-route-helpers'
import { getSkillAnalyticsService } from '@/lib/skill/skill-analytics-di'

export {
  setSkillAnalyticsServiceForTesting,
  clearSkillAnalyticsServiceForTesting,
} from '@/lib/skill/skill-analytics-di'

export async function GET(): Promise<NextResponse> {
  const guard = await requireHrManager()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getSkillAnalyticsService>
  try {
    svc = getSkillAnalyticsService()
  } catch {
    return NextResponse.json(
      { error: 'SkillAnalyticsService not initialized' },
      { status: 503 },
    )
  }

  try {
    const summary = await svc.getOrganizationSummary()
    return NextResponse.json({ success: true, data: summary })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
