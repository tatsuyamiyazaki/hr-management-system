/**
 * Issue #27: 邨・ｹ皮ｮ｡逅・API 繝ｫ繝ｼ繝医・蜈ｱ騾壹・繝ｫ繝・
 *
 * - HR_MANAGER 繧ｻ繝・す繝ｧ繝ｳ繧ｬ繝ｼ繝・(Requirement 3.3)
 * - 逶｣譟ｻ繧ｳ繝ｳ繝・く繧ｹ繝域歓蜃ｺ (ipAddress / userAgent)
 * - 繝峨Γ繧､繝ｳ繧ｨ繝ｩ繝ｼ 竊・NextResponse 繝槭ャ繝斐Φ繧ｰ
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import {
  CyclicReferenceError,
  DepartmentNotFoundError,
  PositionNotFoundError,
} from './organization-types'
import type { OrganizationAuditContext } from './organization-service'

export interface HrManagerSession {
  readonly userId: string
  readonly role: 'HR_MANAGER' | 'ADMIN'
}

/**
 * HR_MANAGER / ADMIN 繧ｻ繝・す繝ｧ繝ｳ繧呈､懆ｨｼ縺励※ userId 繧定ｿ斐☆縲・
 * 401 / 403 縺ｮ蝣ｴ蜷医・ NextResponse 繧定ｿ斐☆縲・
 */
export async function requireHrManager(): Promise<
  { ok: true; session: HrManagerSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId || (role !== 'HR_MANAGER' && role !== 'ADMIN')) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, session: { userId, role: role as HrManagerSession['role'] } }
}

/** 繝ｪ繧ｯ繧ｨ繧ｹ繝医°繧臥屮譟ｻ繧ｳ繝ｳ繝・く繧ｹ繝医ｒ謚ｽ蜃ｺ縺吶ｋ */
export function extractOrganizationAuditContext(
  req: NextRequest,
  userId: string,
): OrganizationAuditContext {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  return { userId, ipAddress, userAgent }
}

/** 繝ｪ繧ｯ繧ｨ繧ｹ繝医・繝・ぅ繧・JSON 縺ｨ縺励※繝代・繧ｹ縺吶ｋ */
export async function parseJsonBody(
  req: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    const body = (await req.json()) as unknown
    return { ok: true, body }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    }
  }
}

/** 邨・ｹ斐ラ繝｡繧､繝ｳ萓句､悶ｒ HTTP 繝ｬ繧ｹ繝昴Φ繧ｹ縺ｫ螟画鋤縺吶ｋ縲・*/
export function organizationErrorToResponse(err: unknown): NextResponse {
  if (err instanceof CyclicReferenceError) {
    return NextResponse.json(
      { error: 'Cyclic reference', kind: err.kind, path: err.path },
      { status: 422 },
    )
  }
  if (err instanceof DepartmentNotFoundError) {
    return NextResponse.json(
      { error: 'Department not found', id: err.departmentId },
      { status: 404 },
    )
  }
  if (err instanceof PositionNotFoundError) {
    return NextResponse.json({ error: 'Position not found', id: err.positionId }, { status: 404 })
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
