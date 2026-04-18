/**
 * Issue #24 / Req 2.2: 役職マスタ更新 / 削除 API (ADMIN のみ)
 *
 * - PUT    /api/masters/roles/:id (body: RoleMasterInput)
 * - DELETE /api/masters/roles/:id
 */
import { type NextRequest, NextResponse } from 'next/server'
import { roleMasterInputSchema, toRoleMasterId } from '@/lib/master/master-types'
import {
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
  const validated = roleMasterInputSchema.safeParse(merged)
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
    const updated = await svc.upsertRole(validated.data)
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
    await svc.deleteRole(toRoleMasterId(id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}
