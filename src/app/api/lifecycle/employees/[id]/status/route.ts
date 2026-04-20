/**
 * Issue #29 / Req 14.2, 14.3, 14.4: 遉ｾ蜩｡繧ｹ繝・・繧ｿ繧ｹ譖ｴ譁ｰ API
 *
 * PATCH /api/lifecycle/employees/{id}/status
 * - ADMIN 縺ｾ縺溘・ HR_MANAGER 縺ｮ縺ｿ螳溯｡悟庄閭ｽ
 * - body: { newStatus, effectiveDate (YYYY-MM-DD), reason? }
 * - 200: 譖ｴ譁ｰ謌仙粥
 * - 422: 繝舌Μ繝・・繧ｷ繝ｧ繝ｳ繧ｨ繝ｩ繝ｼ
 * - 401 / 403: 隱崎ｨｼ/隱榊庄繧ｨ繝ｩ繝ｼ
 * - 404: 遉ｾ蜩｡縺悟ｭ伜惠縺励↑縺・
 * - 409: 荳肴ｭ｣縺ｪ繧ｹ繝・・繧ｿ繧ｹ驕ｷ遘ｻ
 * - 503: 繧ｵ繝ｼ繝薙せ譛ｪ蛻晄悄蛹・
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getLifecycleService } from '@/lib/lifecycle/lifecycle-service-di'
import {
  updateEmployeeStatusInputSchema,
  EmployeeNotFoundError,
  InvalidStatusTransitionError,
} from '@/lib/lifecycle/lifecycle-types'

const ALLOWED_ROLES = new Set<string>(['ADMIN', 'HR_MANAGER'])

interface AuthorizedSession {
  readonly userId: string
}

function authorize(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
): { ok: true; session: AuthorizedSession } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!role || !ALLOWED_ROLES.has(role) || !userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session: { userId } }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = authorize(await getAppSession())
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateEmployeeStatusInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getLifecycleService>
  try {
    svc = getLifecycleService()
  } catch {
    return NextResponse.json({ error: 'Lifecycle service not initialized' }, { status: 503 })
  }

  try {
    await svc.updateStatus(id, parsed.data)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof EmployeeNotFoundError) {
      return NextResponse.json({ error: 'Employee not found', userId: err.userId }, { status: 404 })
    }
    if (err instanceof InvalidStatusTransitionError) {
      return NextResponse.json(
        { error: 'Invalid status transition', from: err.from, to: err.to },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
