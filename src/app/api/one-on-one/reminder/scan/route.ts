/**
 * Issue #49 / Req 7.6: 1on1ログ未入力リマインダー手動トリガー API
 *
 * POST /api/one-on-one/reminder/scan
 * - ADMIN のみ実行可能
 * - 200: { notified: number; skipped: number }
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

export function setOneOnOneReminderServiceForTesting(s: OneOnOneReminderService): void {
  _service = s
}

export function clearOneOnOneReminderServiceForTesting(): void {
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
// 認可
// ─────────────────────────────────────────────────────────────────────────────

function authorize(
  serverSession: Awaited<ReturnType<typeof getServerSession>>,
): { ok: true } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  if (role !== 'ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/one-on-one/reminder/scan
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
  const auth = authorize(serverSession)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const result = await service.scanMissingLogs()
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
