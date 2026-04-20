/**
 * Issue #24 / Req 2.3: 等級マスタ一覧 / 作成 API (ADMIN のみ)
 *
 * - GET  /api/masters/grades
 * - POST /api/masters/grades (body: GradeMasterInput; w1+w2+w3=1)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { gradeMasterInputSchema } from '@/lib/master/master-types'
import {
  extractAuditContext,
  masterErrorToResponse,
  parseJsonBody,
  requireAdmin,
} from '@/lib/master/master-route-helpers'
import { getMasterService } from '@/lib/master/master-service-di'

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getMasterService>
  try {
    svc = getMasterService()
  } catch {
    return NextResponse.json({ error: 'Master service not initialized' }, { status: 503 })
  }

  try {
    const grades = await svc.listGrades()
    return NextResponse.json({ success: true, data: grades })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = gradeMasterInputSchema.safeParse(parsedBody.body)
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
    // POST は新規作成のため before=null、履歴/監査は発行されない。
    // context はシグネチャを統一する目的でのみ渡す。
    const context = extractAuditContext(request)
    const created = await svc.upsertGrade(validated.data, guard.session.userId, context)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}
