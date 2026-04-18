/**
 * Issue #27: 組織管理 API ルートの共通ヘルパ
 *
 * - HR_MANAGER セッションガード (Requirement 3.3)
 * - 監査コンテキスト抽出 (ipAddress / userAgent)
 * - ドメインエラー → NextResponse マッピング
 */
import { getServerSession } from 'next-auth'
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
 * HR_MANAGER / ADMIN セッションを検証して userId を返す。
 * 401 / 403 の場合は NextResponse を返す。
 */
export async function requireHrManager(): Promise<
  { ok: true; session: HrManagerSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getServerSession()
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

/** リクエストから監査コンテキストを抽出する */
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

/** リクエストボディを JSON としてパースする */
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

/** 組織ドメイン例外を HTTP レスポンスに変換する。 */
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
