/**
 * Issue #49 / Req 7.7: 評価フォーム用 1on1 ログ参照リンク API
 *
 * GET /api/one-on-one/evaluation-links?employeeId=...&from=...&to=...
 * - 本人 または MANAGER 以上のみ参照可能
 * - 200: EvaluationLogLink[]
 * - 400: クエリパラメータ不正
 * - 401 / 403: 認証/認可エラー
 * - 503: サービス未初期化
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createOneOnOneReminderService,
  type OneOnOneReminderService,
} from '@/lib/one-on-one/one-on-one-reminder-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'

// ─────────────────────────────────────────────────────────────────────────────
// DI（テスト差し替え用）
// ─────────────────────────────────────────────────────────────────────────────

let _service: OneOnOneReminderService | null = null

export function setEvaluationLinksServiceForTesting(s: OneOnOneReminderService): void {
  _service = s
}

export function clearEvaluationLinksServiceForTesting(): void {
  _service = null
}

function getService(): OneOnOneReminderService {
  if (_service) return _service
  return createOneOnOneReminderService({
    subordinateRepo: {
      async findAllSubordinatesWithLastLog() {
        return []
      },
    },
    sessionRepo: {
      async findSessionsInRange() {
        return []
      },
      async listAllLogs() {
        return { data: [], total: 0 }
      },
    },
    notificationRepo: createInMemoryNotificationRepository(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 認可: 本人 または MANAGER 以上
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['ADMIN', 'HR_MANAGER', 'MANAGER'])

function authorize(
  serverSession: Awaited<ReturnType<typeof getServerSession>>,
  employeeId: string,
): { ok: true } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.id === 'string' ? sess.id : undefined

  const isSelf = userId === employeeId
  const isManagerOrAbove = role !== undefined && ALLOWED_ROLES.has(role)

  if (!isSelf && !isManagerOrAbove) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/one-on-one/evaluation-links
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const employeeId = searchParams.get('employeeId')
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  if (!employeeId || !fromStr || !toStr) {
    return NextResponse.json(
      { error: 'Missing required query parameters: employeeId, from, to' },
      { status: 400 },
    )
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date format for from or to' }, { status: 400 })
  }

  const serverSession = await getServerSession()
  const auth = authorize(serverSession, employeeId)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const links = await service.getEvaluationLinks(employeeId, from, to)
    return NextResponse.json(links, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
