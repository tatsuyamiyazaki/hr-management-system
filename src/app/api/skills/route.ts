/**
 * Issue #36 / Task 11.2: 社員スキル一覧 / 登録 API (Req 4.4, 4.5)
 *
 * - GET  /api/skills?userId=...  — スキル一覧
 *   * 本人のスキル (userId 省略 or 本人 ID) → 全ロールで可
 *   * 他人のスキル (userId 指定) → MANAGER / HR_MANAGER / ADMIN のみ
 * - POST /api/skills              — スキル登録 (常にセッション userId を使う)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { employeeSkillInputSchema } from '@/lib/skill/skill-types'
import {
  isManagerOrAbove,
  parseJsonBody,
  requireAuthenticated,
  skillErrorToResponse,
} from '@/lib/skill/skill-route-helpers'
import { getSkillService } from '@/lib/skill/skill-service-di'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

  const targetUserId = request.nextUrl.searchParams.get('userId') ?? guard.session.userId
  if (targetUserId !== guard.session.userId && !isManagerOrAbove(guard.session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof getSkillService>
  try {
    svc = getSkillService()
  } catch {
    return NextResponse.json({ error: 'Skill service not initialized' }, { status: 503 })
  }

  try {
    const skills = await svc.listMySkills(targetUserId)
    return NextResponse.json({ success: true, data: skills })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response

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
    // セッションの userId を強制使用 (他人のスキル登録を防ぐ)
    const created = await svc.registerSkill(guard.session.userId, validated.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return skillErrorToResponse(err)
  }
}
