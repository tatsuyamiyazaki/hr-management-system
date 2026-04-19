/**
 * Issue #45 / Req 6.8: 目標期限アラート手動トリガー API
 *
 * POST /api/goals/deadline-alerts/scan
 * - ADMIN のみ実行可能
 * - 200: { notified: number; skipped: number }
 * - 401 / 403: 認証/認可エラー
 * - 503: サービス未初期化
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createDeadlineAlertService,
  type DeadlineAlertService,
} from '@/lib/goal/deadline-alert-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'

// ─────────────────────────────────────────────────────────────────────────────
// DI（テスト差し替え用）
// ─────────────────────────────────────────────────────────────────────────────

let _service: DeadlineAlertService | null = null

export function setDeadlineAlertServiceForTesting(s: DeadlineAlertService): void {
  _service = s
}

export function clearDeadlineAlertServiceForTesting(): void {
  _service = null
}

function getService(): DeadlineAlertService {
  if (_service) return _service
  // 本番では Prisma-backed リポジトリを注入する
  // 現時点では InMemory 実装をフォールバックとして使用
  return createDeadlineAlertService({
    goalRepo: {
      async findInProgressGoalsNearDeadline() {
        return []
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
// POST /api/goals/deadline-alerts/scan
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
  const auth = authorize(serverSession)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const result = await service.scanDeadlineAlerts()
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
