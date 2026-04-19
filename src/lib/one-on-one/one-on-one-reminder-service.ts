/**
 * Issue #49 / Req 7.6, 7.7, 7.8: 1on1ログ未入力リマインダーサービス
 *
 * - 30日以上ログがない部下を検出し、MANAGERに DEADLINE_ALERT 通知
 * - 評価フォーム用: 指定期間の 1on1 ログへの参照リンクを返す
 * - HR_MANAGER 用: 全 1on1 ログ一覧（ページネーション付き）
 */

import type { NotificationRepository } from '@/lib/notification/notification-repository'
import type {
  AllLogsQuery,
  AllLogsResult,
  EvaluationLogLink,
  MissingLogEmployee,
} from './one-on-one-reminder-types'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** ログ未入力とみなす閾値（日数） */
export const MISSING_LOG_THRESHOLD_DAYS = 30

// ─────────────────────────────────────────────────────────────────────────────
// Repository interfaces (依存性逆転)
// ─────────────────────────────────────────────────────────────────────────────

/** MANAGERとその部下の関係を取得するリポジトリ */
export interface ManagerSubordinateRepository {
  /**
   * 全マネージャーとその部下ペア、および各部下の最終ログ日時を返す
   * lastLogDate が null の場合は一度もログなし
   */
  findAllSubordinatesWithLastLog(now: Date): Promise<readonly MissingLogEmployee[]>
}

/** 1on1セッションを取得するリポジトリ */
export interface OneOnOneSessionRepository {
  /**
   * 指定期間内に scheduledAt がある employeeId のセッション一覧を返す
   * ログが存在するかどうかも含む
   */
  findSessionsInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<readonly EvaluationLogLink[]>

  /**
   * 全セッションに紐づくログ一覧をページネーション付きで返す
   */
  listAllLogs(query: AllLogsQuery): Promise<AllLogsResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanMissingLogsResult {
  readonly notified: number
  readonly skipped: number
}

export interface OneOnOneReminderService {
  /**
   * 30日以上ログがない部下を検出し、MANAGERに DEADLINE_ALERT 通知
   * @param now スキャン基準日時（省略時は現在時刻）
   */
  scanMissingLogs(now?: Date): Promise<ScanMissingLogsResult>

  /**
   * 評価フォーム用: 指定期間の 1on1 ログへの参照リンクを返す
   */
  getEvaluationLinks(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<readonly EvaluationLogLink[]>

  /**
   * HR_MANAGER 用: 全 1on1 ログ一覧（ページネーション付き）
   */
  listAllLogs(query: AllLogsQuery): Promise<AllLogsResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function calcDaysSince(now: Date, lastLogDate: Date): number {
  const diffMs = now.getTime() - lastLogDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function buildMissingLogNotificationTitle(): string {
  return '1on1ログが未入力です'
}

function buildMissingLogNotificationBody(employeeId: string, daysSince: number): string {
  return `部下（ID: ${employeeId}）の1on1ログが${daysSince}日間未入力です。早めに記録しましょう。`
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface Dependencies {
  readonly subordinateRepo: ManagerSubordinateRepository
  readonly sessionRepo: OneOnOneSessionRepository
  readonly notificationRepo: NotificationRepository
}

class OneOnOneReminderServiceImpl implements OneOnOneReminderService {
  constructor(private readonly deps: Dependencies) {}

  async scanMissingLogs(now?: Date): Promise<ScanMissingLogsResult> {
    const scanTime = now ?? new Date()
    const subordinates = await this.deps.subordinateRepo.findAllSubordinatesWithLastLog(scanTime)

    let notified = 0
    let skipped = 0

    for (const sub of subordinates) {
      const daysSince =
        sub.lastLogDate === null
          ? MISSING_LOG_THRESHOLD_DAYS // 一度もログなし → 閾値以上とみなす
          : calcDaysSince(scanTime, sub.lastLogDate)

      if (daysSince < MISSING_LOG_THRESHOLD_DAYS) {
        skipped += 1
        continue
      }

      try {
        await this.deps.notificationRepo.create({
          userId: sub.managerId,
          category: 'DEADLINE_ALERT',
          title: buildMissingLogNotificationTitle(),
          body: buildMissingLogNotificationBody(sub.employeeId, daysSince),
          payload: {
            employeeId: sub.employeeId,
            daysSinceLastLog: daysSince,
            lastLogDate: sub.lastLogDate?.toISOString() ?? null,
          },
        })
        notified += 1
      } catch {
        // 通知サービスが未初期化の場合などは無視してスキップ扱い
        skipped += 1
      }
    }

    return { notified, skipped }
  }

  async getEvaluationLinks(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<readonly EvaluationLogLink[]> {
    return this.deps.sessionRepo.findSessionsInRange(employeeId, from, to)
  }

  async listAllLogs(query: AllLogsQuery): Promise<AllLogsResult> {
    return this.deps.sessionRepo.listAllLogs(query)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOneOnOneReminderService(deps: Dependencies): OneOnOneReminderService {
  return new OneOnOneReminderServiceImpl(deps)
}
