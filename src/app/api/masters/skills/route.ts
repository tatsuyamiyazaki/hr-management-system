/**
 * Issue #24 / Req 2.1: スキルマスタ一覧 / 作成 API (ADMIN のみ)
 *
 * - GET  /api/masters/skills?includeDeprecated=true
 * - POST /api/masters/skills (body: SkillMasterInput)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { skillMasterInputSchema } from '@/lib/master/master-types'
import {
  masterErrorToResponse,
  parseJsonBody,
  requireAdmin,
} from '@/lib/master/master-route-helpers'
import { getMasterService } from '@/lib/master/master-service-di'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const includeDeprecated = request.nextUrl.searchParams.get('includeDeprecated') === 'true'

  let svc: ReturnType<typeof getMasterService>
  try {
    svc = getMasterService()
  } catch {
    return NextResponse.json({ error: 'Master service not initialized' }, { status: 503 })
  }

  try {
    const skills = await svc.listSkills(includeDeprecated)
    return NextResponse.json({ success: true, data: skills })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = skillMasterInputSchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getMasterService>
  try {
    svc = getMasterService()
  } catch {
    return NextResponse.json({ error: 'Master service not initialized' }, { status: 503 })
  }

  try {
    const created = await svc.upsertSkill(validated.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}
