/**
 * Issue #36 / Task 11.2: 承認待ちスキル一覧 API (Req 4.5)
 *
 * GET /api/skills/pending
 * - MANAGER / HR_MANAGER / ADMIN のみ
 * - 呼び出しユーザーの部下 (supervisorPositionId 経由) の未承認スキルのみを返す
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireManager, skillErrorToResponse } from '@/lib/skill/skill-route-helpers'
import { getSkillService } from '@/lib/skill/skill-service-di'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getSkillService>
  try {
    svc = getSkillService()
  } catch {
    return NextResponse.json({ error: 'Skill service not initialized' }, { status: 503 })
  }

  try {
    const pending = await svc.listPendingApproval(guard.session.userId)
    return NextResponse.json({ success: true, data: pending })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}
