/**
 * Issue #36 / Task 11.2: 社員スキル更新 / 削除 API (Req 4.4, 4.5)
 *
 * - PUT    /api/skills/:id — スキル更新 (本人のみ、upsert で承認状態をリセット)
 * - DELETE /api/skills/:id — スキル削除 (本人のみ)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { employeeSkillInputSchema, toEmployeeSkillId } from '@/lib/skill/skill-types'
import {
  parseJsonBody,
  requireAuthenticated,
  skillErrorToResponse,
} from '@/lib/skill/skill-route-helpers'
import { getSkillService } from '@/lib/skill/skill-service-di'

interface RouteContext {
  readonly params: Promise<{ id: string }>
}

async function resolveParams(ctx: RouteContext): Promise<{ id: string }> {
  return ctx.params
}

export async function PUT(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const { id } = await resolveParams(ctx)
  if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 })

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = employeeSkillInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getSkillService>
  try {
    svc = getSkillService()
  } catch {
    return NextResponse.json({ error: 'Skill service not initialized' }, { status: 503 })
  }

  try {
    // (userId, skillId) で upsert されるため、url の id は参照情報。
    const updated = await svc.registerSkill(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const guard = await requireAuthenticated()
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
    await svc.deleteMySkill(guard.session.userId, toEmployeeSkillId(id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}
