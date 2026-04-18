/**
 * Issue #27 / Req 3.8: 組織データ CSV エクスポート投入 API (HR_MANAGER / ADMIN)
 *
 * - POST /api/organization/export
 *   ExportJob に OrganizationCsv ジョブを投入し、jobId を返す。
 *   実際の CSV 生成は export-worker 側で行う。
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  extractOrganizationAuditContext,
  organizationErrorToResponse,
  requireHrManager,
} from '@/lib/organization/organization-route-helpers'
import { getOrganizationService } from '@/lib/organization/organization-service-di'

export {
  setOrganizationServiceForTesting,
  clearOrganizationServiceForTesting,
} from '@/lib/organization/organization-service-di'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireHrManager()
  if (!guard.ok) return guard.response

  let svc: ReturnType<typeof getOrganizationService>
  try {
    svc = getOrganizationService()
  } catch {
    return NextResponse.json({ error: 'Organization service not initialized' }, { status: 503 })
  }

  try {
    const context = extractOrganizationAuditContext(request, guard.session.userId)
    const result = await svc.exportCsv(context)
    return NextResponse.json({ success: true, data: result }, { status: 202 })
  } catch (err) {
    return organizationErrorToResponse(err)
  }
}
