import type {
  DeliveryStatus,
  NotificationCategory,
  NotificationChannel,
} from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 通知配信ログ 1 エントリ分。
 * Requirement 15.7: 宛先・内容・送信結果・タイムスタンプを記録
 */
export interface NotificationLogEntry {
  userId: string
  category: NotificationCategory
  channel: NotificationChannel
  /** 件名。IN_APP など件名を持たないチャネルでは null */
  subject: string | null
  status: DeliveryStatus
  /** 試行回数 (1 が初回) */
  attempts: number
  /** 失敗時のエラー詳細。成功時は null */
  errorDetail: string | null
  /** 記録時刻 (UTC ISO8601)。record 実装が自動付与するため外部入力不可 */
  readonly recordedAt?: string
}

export interface NotificationLogRecorder {
  record(entry: NotificationLogEntry): Promise<void>
}

/**
 * テスト用: 記録された全エントリを参照できる InMemory 版。
 */
export interface InMemoryNotificationLogRecorder extends NotificationLogRecorder {
  readonly entries: readonly NotificationLogEntry[]
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory 実装
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryLogRecorder implements InMemoryNotificationLogRecorder {
  private readonly store: NotificationLogEntry[] = []

  async record(entry: NotificationLogEntry): Promise<void> {
    // 不変性: 入力を直接参照せず、タイムスタンプ付きの新オブジェクトを push する
    const stamped: NotificationLogEntry = {
      ...entry,
      recordedAt: entry.recordedAt ?? new Date().toISOString(),
    }
    this.store.push(stamped)
  }

  get entries(): readonly NotificationLogEntry[] {
    // 外部からの破壊的変更を防ぐため防御コピーを返す
    return this.store.slice()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * テスト用のインメモリ NotificationLogRecorder を生成する。
 * 本番用の Prisma 実装は別タスク（Task 4.3 以降）で提供予定。
 */
export function createInMemoryLogRecorder(): InMemoryNotificationLogRecorder {
  return new InMemoryLogRecorder()
}
