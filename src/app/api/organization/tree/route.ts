/**
 * Issue #27 / Req 3.6: 組織ツリー取得 API (HR_MANAGER / ADMIN)
 *
 * - GET /api/organization/tree
 */
import { NextResponse } from 'next/server'
import {
  organizationErrorToResponse,
  requireHrManager,
} from '@/lib/organization/organization-route-helpers'
import { getOrganizationService } from '@/lib/organization/organization-service-di'

export {
  setOrganizationServiceForTesting,
  clearOrganizationServiceForTesting,
} from '@/lib/organization/organization-service-di'

export async function GET(): Promise<NextResponse> {
  const guard = await requireHrManager()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getOrganizationService>
  try {
    svc = getOrganizationService()
  } catch {
    return NextResponse.json({ error: 'Organization service not initialized' }, { status: 503 })
  }

  try {
    const tree = await svc.getCurrentTree()
    return NextResponse.json({ success: true, data: tree })
  } catch (err) {
    return organizationErrorToResponse(err)
  }
}
