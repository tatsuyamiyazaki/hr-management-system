/**
 * Issue #24 / Req 2.3, 2.6 / #25: 等級マスタ更新 / 削除 API (ADMIN のみ)
 *
 * - PUT    /api/masters/grades/:id (body: GradeMasterInput)
 *          → ウェイト変更時は GradeWeightHistory + MASTER_DATA_CHANGE 監査ログを発行
 * - DELETE /api/masters/grades/:id
 */
import { type NextRequest, NextResponse } from 'next/server'
import { gradeMasterInputSchema, toGradeMasterId } from '@/lib/master/master-types'
import {
  extractAuditContext,
  masterErrorToResponse,
  parseJsonBody,
  requireAdmin,
} from '@/lib/master/master-route-helpers'
import { getMasterService } from '@/lib/master/master-service-di'

export {
  setMasterServiceForTesting,
  clearMasterServiceForTesting,
} from '@/lib/master/master-service-di'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params
  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const merged = { ...(parsedBody.body as Record<string, unknown>), id }
  const validated = gradeMasterInputSchema.safeParse(merged)
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
    const context = extractAuditContext(request)
    const updated = await svc.upsertGrade(validated.data, guard.session.userId, context)
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params

  let svc: ReturnType<typeof getMasterService>
  try {
    svc = getMasterService()
  } catch {
    return NextResponse.json({ error: 'Master service not initialized' }, { status: 503 })
  }

  try {
    await svc.deleteGrade(toGradeMasterId(id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}
