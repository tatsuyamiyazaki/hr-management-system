/**
 * Issue #175 / Task 11.4 / Req 4.8: スキルギャップランキング API
 *
 * GET /api/skills/post-candidates/gap-ranking
 * - HR_MANAGER / ADMIN のみ
 * - 組織目標に対するスキルギャップ上位一覧を返す
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'
import { getPostCandidateService } from '@/lib/skill/post-candidate-service-di'

const HR_MANAGER_ROLES = ['HR_MANAGER', 'ADMIN'] as const

function isHrManagerOrAbove(role: string): boolean {
  return (HR_MANAGER_ROLES as readonly string[]).includes(role)
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  if (!isHrManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getPostCandidateService>
  try {
    svc = getPostCandidateService()
  } catch {
    return NextResponse.json({ error: 'Post candidate service not initialized' }, { status: 503 })
  }

  try {
    const data = await svc.getSkillGapRanking()
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
