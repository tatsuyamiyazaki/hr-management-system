/**
 * Issue #36 / Task 11.2: 遉ｾ蜩｡繧ｹ繧ｭ繝ｫ API 繝ｫ繝ｼ繝医・蜈ｱ騾壹・繝ｫ繝・(Req 4.4, 4.5)
 *
 * - 隱崎ｨｼ繧ｬ繝ｼ繝・(requireAuthenticated)
 * - 繝槭ロ繝ｼ繧ｸ繝｣繝ｼ莉･荳翫Ο繝ｼ繝ｫ繧ｬ繝ｼ繝・(requireManager)
 * - 繝ｪ繧ｯ繧ｨ繧ｹ繝医・繝・ぅ繝代・繧ｹ
 * - 逶｣譟ｻ繧ｳ繝ｳ繝・く繧ｹ繝域歓蜃ｺ
 * - 繝峨Γ繧､繝ｳ繧ｨ繝ｩ繝ｼ 竊・NextResponse 繝槭ャ繝斐Φ繧ｰ
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@/lib/notification/notification-types'
import type { SkillAuditContext } from './skill-service'
import {
  SkillAccessDeniedError,
  SkillAlreadyRegisteredError,
  SkillNotFoundError,
} from './skill-types'

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Session types
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface AuthenticatedSkillSession {
  readonly userId: string
  readonly role: UserRole
}

// Roles that can approve skills or see pending list (Req 4.5)
const MANAGER_OR_ABOVE_ROLES: readonly UserRole[] = ['MANAGER', 'HR_MANAGER', 'ADMIN']

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Session guards
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * 隱崎ｨｼ貂医∩繧ｻ繝・す繝ｧ繝ｳ繧呈､懆ｨｼ縺励※ userId / role 繧定ｿ斐☆縲・
 * 譛ｪ隱崎ｨｼ縺ｮ蝣ｴ蜷・401 繧定ｿ斐☆縲・
 */
export async function requireAuthenticated(): Promise<
  { ok: true; session: AuthenticatedSkillSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getAppSession()
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const roleValue = sess.role
  if (!userId || !isUserRole(roleValue)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session: { userId, role: roleValue } }
}

/**
 * MANAGER / HR_MANAGER / ADMIN 縺ｮ縺・★繧後°繧定ｦ∵ｱ・(Req 4.5)縲・
 * 譛ｪ隱崎ｨｼ 竊・401縲√Ο繝ｼ繝ｫ荳崎ｶｳ 竊・403縲・
 */
export async function requireManager(): Promise<
  { ok: true; session: AuthenticatedSkillSession } | { ok: false; response: NextResponse }
> {
  const auth = await requireAuthenticated()
  if (!auth.ok) return auth
  if (!MANAGER_OR_ABOVE_ROLES.includes(auth.session.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

/**
 * MANAGER / HR_MANAGER / ADMIN 縺九ｒ蛻､螳壹☆繧九Θ繝ｼ繝・ぅ繝ｪ繝・ぅ (Guard 貂医∩繧ｻ繝・す繝ｧ繝ｳ逕ｨ)
 */
export function isManagerOrAbove(role: UserRole): boolean {
  return MANAGER_OR_ABOVE_ROLES.includes(role)
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Request utilities
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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

export function extractSkillAuditContext(req: NextRequest): SkillAuditContext {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  return { ipAddress, userAgent }
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// Error mapping
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * 繧ｹ繧ｭ繝ｫ繝峨Γ繧､繝ｳ萓句､悶ｒ HTTP 繝ｬ繧ｹ繝昴Φ繧ｹ縺ｫ螟画鋤縺吶ｋ縲・
 * 譛ｪ遏･縺ｮ繧ｨ繝ｩ繝ｼ縺ｯ 500 繧定ｿ斐☆縲・
 */
export function skillErrorToResponse(err: unknown): NextResponse {
  if (err instanceof SkillNotFoundError) {
    return NextResponse.json(
      { error: 'Skill not found', kind: err.kind, id: err.resourceId },
      { status: 404 },
    )
  }
  if (err instanceof SkillAlreadyRegisteredError) {
    return NextResponse.json(
      {
        error: 'Skill already registered',
        userId: err.userId,
        skillId: err.skillId,
      },
      { status: 409 },
    )
  }
  if (err instanceof SkillAccessDeniedError) {
    return NextResponse.json({ error: 'Access denied', reason: err.reason }, { status: 403 })
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
