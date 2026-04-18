/**
 * Issue #37 / Req 4.2: スキルヒートマップ API
 *
 * GET /api/skill-analytics/heatmap
 *   - HR_MANAGER / ADMIN のみ
 *   - 部署 × カテゴリの SkillHeatmap を返す
 */
import { NextResponse } from 'next/server'
import { requireHrManager } from '@/lib/organization/organization-route-helpers'
import { getSkillAnalyticsService } from '@/lib/skill/skill-analytics-di'

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
    const heatmap = await svc.getHeatmap()
    return NextResponse.json({ success: true, data: heatmap })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
