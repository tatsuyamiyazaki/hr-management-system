/**
 * Issue #24 / Req 2.2: 役職マスタ一覧 / 作成 API (ADMIN のみ)
 *
 * - GET  /api/masters/roles
 * - POST /api/masters/roles (body: RoleMasterInput)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { roleMasterInputSchema } from '@/lib/master/master-types'
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
    const roles = await svc.listRoles()
    return NextResponse.json({ success: true, data: roles })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = roleMasterInputSchema.safeParse(parsedBody.body)
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
    const created = await svc.upsertRole(validated.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return masterErrorToResponse(err)
  }
}
