/**
 * Issue #27 / Req 3.3, 3.4: 組織変更プレビュー API (HR_MANAGER / ADMIN)
 *
 * - POST /api/organization/preview  body: { changes: OrgChange[] }
 *   循環参照が発生する場合も、警告を summary に含めて 200 で返す。
 *   コミット時点での循環参照は 422 になる (commit ルート参照)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
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
    const preview = await svc.previewHierarchyChange(validated.data.changes)
    return NextResponse.json({ success: true, data: preview })
  } catch (err) {
    return organizationErrorToResponse(err)
  }
}
