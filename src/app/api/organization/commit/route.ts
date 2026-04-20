/**
 * Issue #27 / Req 3.3, 3.4: 組織変更確定 API (HR_MANAGER / ADMIN)
 *
 * - POST /api/organization/commit  body: { changes: OrgChange[] }
 *   循環参照があれば 422 を返し、DB 保存は行わない。
 *   成功時は ORGANIZATION_CHANGE の監査ログを発行する (service 内で実施)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  extractOrganizationAuditContext,
  organizationErrorToResponse,
  parseJsonBody,
  requireHrManager,
} from '@/lib/organization/organization-route-helpers'
import { getOrganizationService } from '@/lib/organization/organization-service-di'
import { orgChangeSchema } from '@/lib/organization/organization-types'

const bodySchema = z.object({ changes: z.array(orgChangeSchema) })

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireHrManager()
  if (!guard.ok) return guard.response

  const parsedBody = await parseJsonBody(request)
  if (!parsedBody.ok) return parsedBody.response

  const validated = bodySchema.safeParse(parsedBody.body)
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getOrganizationService>
  try {
    svc = getOrganizationService()
  } catch {
    return NextResponse.json({ error: 'Organization service not initialized' }, { status: 503 })
  }

  try {
    const context = extractOrganizationAuditContext(request, guard.session.userId)
    const result = await svc.commitHierarchyChange(validated.data.changes, context)
    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'Cyclic reference',
          kind: result.error.kind,
          path: result.error.path,
        },
        { status: 422 },
      )
    }
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    return organizationErrorToResponse(err)
  }
}
