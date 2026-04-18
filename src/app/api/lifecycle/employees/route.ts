/**
 * Issue #29 / Req 14.1: 社員作成 API
 *
 * POST /api/lifecycle/employees
 * - ADMIN または HR_MANAGER のみ実行可能
 * - body: CreateEmployeeInput (hireDate は YYYY-MM-DD)
 * - 201: 作成された社員の基本情報
 * - 422: バリデーションエラー
 * - 401 / 403: 認証/認可エラー
 * - 409: email 重複
 * - 503: サービス未初期化
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { getLifecycleService } from '@/lib/lifecycle/lifecycle-service-di'
import {
  createEmployeeInputSchema,
  EmployeeAlreadyExistsError,
  type Employee,
} from '@/lib/lifecycle/lifecycle-types'

export {
  setLifecycleServiceForTesting,
  clearLifecycleServiceForTesting,
} from '@/lib/lifecycle/lifecycle-service-di'

const ALLOWED_ROLES = new Set<string>(['ADMIN', 'HR_MANAGER'])

interface AuthorizedSession {
  readonly userId: string
}

function authorize(
  serverSession: Awaited<ReturnType<typeof getServerSession>>,
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

function toResponsePayload(employee: Employee): Record<string, unknown> {
  return {
    id: employee.id,
    email: employee.email,
    firstName: employee.firstName,
    lastName: employee.lastName,
    role: employee.role,
    hireDate: employee.hireDate.toISOString().slice(0, 10),
    departmentId: employee.departmentId,
    positionId: employee.positionId,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authorize(await getServerSession())
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createEmployeeInputSchema.safeParse(body)
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
    const employee = await svc.createEmployee(parsed.data, auth.session.userId)
    return NextResponse.json(toResponsePayload(employee), { status: 201 })
  } catch (err) {
    if (err instanceof EmployeeAlreadyExistsError) {
      return NextResponse.json({ error: 'Email already exists', email: err.email }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
