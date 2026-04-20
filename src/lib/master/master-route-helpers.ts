/**
 * Issue #24: 繝槭せ繧ｿ邂｡逅・API 繝ｫ繝ｼ繝医・蜈ｱ騾壹・繝ｫ繝・
 *
 * - ADMIN 繧ｻ繝・す繝ｧ繝ｳ繧ｬ繝ｼ繝・
 * - 逶｣譟ｻ繧ｳ繝ｳ繝・く繧ｹ繝域歓蜃ｺ (ipAddress / userAgent)
 * - 繝峨Γ繧､繝ｳ繧ｨ繝ｩ繝ｼ 竊・NextResponse 繝槭ャ繝斐Φ繧ｰ
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { GradeWeightSumError, MasterNameConflictError, MasterNotFoundError } from './master-types'
import type { MasterAuditContext } from './master-service'

export interface AdminSession {
  readonly userId: string
}

/**
 * ADMIN 繧ｻ繝・す繝ｧ繝ｳ繧呈､懆ｨｼ縺励※ userId 繧定ｿ斐☆縲・
 * 401 / 403 縺ｮ蝣ｴ蜷医・ NextResponse 繧定ｿ斐☆縺ｮ縺ｧ蜻ｼ縺ｳ蜃ｺ縺怜・縺ｧ蜊ｳ return 縺吶ｋ縺薙→縲・
 */
export async function requireAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (role !== 'ADMIN' || !userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session: { userId } }
}

/** 繝ｪ繧ｯ繧ｨ繧ｹ繝医°繧臥屮譟ｻ繧ｳ繝ｳ繝・く繧ｹ繝・(ipAddress / userAgent) 繧呈歓蜃ｺ縺吶ｋ */
export function extractAuditContext(req: NextRequest): MasterAuditContext {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  return { ipAddress, userAgent }
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

/**
 * 繝槭せ繧ｿ繝峨Γ繧､繝ｳ萓句､悶ｒ HTTP 繝ｬ繧ｹ繝昴Φ繧ｹ縺ｫ螟画鋤縺吶ｋ縲・
 * 譛ｪ遏･縺ｮ繧ｨ繝ｩ繝ｼ縺ｯ 500 繧定ｿ斐☆ (rethrow 縺ｯ縺励↑縺・縲・
 */
export function masterErrorToResponse(err: unknown): NextResponse {
  if (err instanceof MasterNotFoundError) {
    return NextResponse.json(
      { error: 'Not found', resource: err.resource, id: err.resourceId },
      { status: 404 },
    )
  }
  if (err instanceof MasterNameConflictError) {
    return NextResponse.json(
      { error: 'Name conflict', resource: err.resource, name: err.conflictingName },
      { status: 409 },
    )
  }
  if (err instanceof GradeWeightSumError) {
    return NextResponse.json(
      { error: 'Grade weights must sum to 1', actualSum: err.actualSum },
      { status: 422 },
    )
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
