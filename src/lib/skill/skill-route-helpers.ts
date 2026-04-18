/**
 * Issue #36 / Task 11.2: 社員スキル API ルートの共通ヘルパ (Req 4.4, 4.5)
 *
 * - 認証ガード (requireAuthenticated)
 * - マネージャー以上ロールガード (requireManager)
 * - リクエストボディパース
 * - 監査コンテキスト抽出
 * - ドメインエラー → NextResponse マッピング
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@/lib/notification/notification-types'
import type { SkillAuditContext } from './skill-service'
import {
  SkillAccessDeniedError,
  SkillAlreadyRegisteredError,
  SkillNotFoundError,
} from './skill-types'

// ─────────────────────────────────────────────────────────────────────────────
// Session types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedSkillSession {
  readonly userId: string
  readonly role: UserRole
}

// Roles that can approve skills or see pending list (Req 4.5)
const MANAGER_OR_ABOVE_ROLES: readonly UserRole[] = ['MANAGER', 'HR_MANAGER', 'ADMIN']

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

// ─────────────────────────────────────────────────────────────────────────────
// Session guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 認証済みセッションを検証して userId / role を返す。
 * 未認証の場合 401 を返す。
 */
export async function requireAuthenticated(): Promise<
  { ok: true; session: AuthenticatedSkillSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getServerSession()
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
 * MANAGER / HR_MANAGER / ADMIN のいずれかを要求 (Req 4.5)。
 * 未認証 → 401、ロール不足 → 403。
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
 * MANAGER / HR_MANAGER / ADMIN かを判定するユーティリティ (Guard 済みセッション用)
 */
export function isManagerOrAbove(role: UserRole): boolean {
  return MANAGER_OR_ABOVE_ROLES.includes(role)
}

// ─────────────────────────────────────────────────────────────────────────────
// Request utilities
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * スキルドメイン例外を HTTP レスポンスに変換する。
 * 未知のエラーは 500 を返す。
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
