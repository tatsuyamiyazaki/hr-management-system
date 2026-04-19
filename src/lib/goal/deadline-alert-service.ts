/**
 * Issue #45 / Req 6.8: 目標期限アラートサービス
 *
 * - 期限7日以内かつ進捗50%未満の IN_PROGRESS 目標をスキャン
 * - daysUntilDeadline が 0, 1, 3, 7 のいずれかの場合のみ通知（重複防止）
 * - 通知カテゴリ: DEADLINE_ALERT
 */

import type { NotificationRepository } from '@/lib/notification/notification-repository'
import {
  ALERT_TRIGGER_DAYS,
  DEADLINE_ALERT_PROGRESS_THRESHOLD,
  DEADLINE_ALERT_SCAN_DAYS,
  type DeadlineAlertTarget,
} from './deadline-alert-types'

// ─────────────────────────────────────────────────────────────────────────────
// Repository interfaces (依存性逆転)
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalWithLatestProgress {
  readonly id: string
  readonly userId: string
  readonly title: string
  readonly endDate: Date
  /** 最新の progressRate。履歴がない場合は 0 */
  readonly latestProgressRate: number
}

export interface DeadlineAlertGoalRepository {
  /** status=IN_PROGRESS かつ endDate が now から scanDays 日以内の目標を返す */
  findInProgressGoalsNearDeadline(
    now: Date,
    scanDays: number,
  ): Promise<readonly GoalWithLatestProgress[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface DeadlineAlertScanResult {
  readonly notified: number
  readonly skipped: number
}

export interface DeadlineAlertService {
  /**
   * 期限7日以内かつ進捗50%未満の目標を検索して通知を送る
   * @param now スキャン基準日時（省略時は現在時刻）
   */
  scanDeadlineAlerts(now?: Date): Promise<DeadlineAlertScanResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2つの日時の差を「日数」で返す（切り捨て）
 * endDate が now より過去の場合は負の値を返す
 */
function calcDaysUntilDeadline(now: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function buildAlertTarget(
  goal: GoalWithLatestProgress,
  daysUntilDeadline: number,
): DeadlineAlertTarget {
  return {
    goalId: goal.id,
    userId: goal.userId,
    title: goal.title,
    endDate: goal.endDate,
    daysUntilDeadline,
    currentProgressRate: goal.latestProgressRate,
  }
}

function buildNotificationTitle(daysUntilDeadline: number): string {
  if (daysUntilDeadline === 0) return '目標の期限が本日です'
  return `目標の期限まで残り${daysUntilDeadline}日です`
}

function buildNotificationBody(target: DeadlineAlertTarget): string {
  return `「${target.title}」の進捗が${target.currentProgressRate}%です。期限（${target.endDate.toLocaleDateString('ja-JP')}）までに完了しましょう。`
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface Dependencies {
  readonly goalRepo: DeadlineAlertGoalRepository
  readonly notificationRepo: NotificationRepository
}

class DeadlineAlertServiceImpl implements DeadlineAlertService {
  constructor(private readonly deps: Dependencies) {}

  async scanDeadlineAlerts(now?: Date): Promise<DeadlineAlertScanResult> {
    const scanTime = now ?? new Date()
    const goals = await this.deps.goalRepo.findInProgressGoalsNearDeadline(
      scanTime,
      DEADLINE_ALERT_SCAN_DAYS,
    )

    let notified = 0
    let skipped = 0

    for (const goal of goals) {
      const daysUntilDeadline = calcDaysUntilDeadline(scanTime, goal.endDate)

      // daysUntilDeadline が 0, 1, 3, 7 のいずれかでない場合はスキップ（重複防止）
      if (!ALERT_TRIGGER_DAYS.has(daysUntilDeadline)) {
        skipped += 1
        continue
      }

      // 進捗50%以上の場合はスキップ
      if (goal.latestProgressRate >= DEADLINE_ALERT_PROGRESS_THRESHOLD) {
        skipped += 1
        continue
      }

      const target = buildAlertTarget(goal, daysUntilDeadline)

      try {
        await this.deps.notificationRepo.create({
          userId: target.userId,
          category: 'DEADLINE_ALERT',
          title: buildNotificationTitle(daysUntilDeadline),
          body: buildNotificationBody(target),
          payload: {
            goalId: target.goalId,
            daysUntilDeadline: target.daysUntilDeadline,
            currentProgressRate: target.currentProgressRate,
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createDeadlineAlertService(deps: Dependencies): DeadlineAlertService {
  return new DeadlineAlertServiceImpl(deps)
}
