/**
 * Issue #27 / Req 3.7: ポジション保持者変更 API (HR_MANAGER / ADMIN)
 *
 * - POST /api/organization/positions/[id]/holder
 *   body: { userId: string, newPositionId?: string | null }
 *   ポジションに保持者を割り当て、TransferRecord を記録する。
 *   newPositionId を null 指定で「割当解除」も可能。
 *
 * URL の [id] は「新しく就く先のポジション ID」として扱う。
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
import { toPositionId, toUserId } from '@/lib/organization/organization-types'

const bodySchema = z.object({
  userId: z.string().min(1),
  /** null 指定で「離任のみ」扱い。省略時は URL の positionId を新ポジションとする */
  newPositionId: z.string().min(1).nullable().optional(),
})

interface RouteContext {
  readonly params: Promise<{ id: string }>
}

async function resolveParams(ctx: RouteContext): Promise<{ id: string }> {
  return ctx.params
}

export async function POST(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const guard = await requireHrManager()
  if (!guard.ok) return guard.response

  const { id } = await resolveParams(ctx)
  if (!id) {
    return NextResponse.json({ error: 'Missing position id' }, { status: 400 })
  }

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
    const newPositionIdRaw =
      validated.data.newPositionId !== undefined ? validated.data.newPositionId : id
    const newPositionId = newPositionIdRaw ? toPositionId(newPositionIdRaw) : null
    const transfer = await svc.changePosition(
      toUserId(validated.data.userId),
      newPositionId,
      context,
    )
    return NextResponse.json({ success: true, data: transfer }, { status: 201 })
  } catch (err) {
    return organizationErrorToResponse(err)
  }
}
