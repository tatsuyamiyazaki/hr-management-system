/**
 * Issue #36 / Task 11.2: 社員スキル承認 API (Req 4.5)
 *
 * POST /api/skills/:id/approve
 * - MANAGER / HR_MANAGER / ADMIN のみ実行可能
 * - 承認日時とマネージャー ID を記録
 * - RECORD_UPDATE 監査ログを発行
 */
import { type NextRequest, NextResponse } from 'next/server'
import { toEmployeeSkillId } from '@/lib/skill/skill-types'
import {
  extractSkillAuditContext,
  requireManager,
  skillErrorToResponse,
} from '@/lib/skill/skill-route-helpers'
import { getSkillService } from '@/lib/skill/skill-service-di'

interface RouteContext {
  readonly params: Promise<{ id: string }>
}

async function resolveParams(ctx: RouteContext): Promise<{ id: string }> {
  return ctx.params
}

export async function POST(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const guard = await requireManager()
  if (!guard.ok) return guard.response

  const { id } = await resolveParams(ctx)
  if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 })

  let svc: ReturnType<typeof getSkillService>
  try {
    svc = getSkillService()
  } catch {
    return NextResponse.json({ error: 'Skill service not initialized' }, { status: 503 })
  }

  try {
    const context = extractSkillAuditContext(request)
    await svc.approveSkill(guard.session.userId, toEmployeeSkillId(id), context)
    return NextResponse.json({ success: true })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}
