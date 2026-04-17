/**
 * Task 6.2 / Req 1.13: パスワード履歴リポジトリ
 *
 * 過去 N 世代のパスワードハッシュを保持し、ユーザー別・新しい順に取得できる。
 * Prisma 実装は後続タスクで追加。ここでは narrow なインターフェースと
 * テスト / ローカル開発向けの InMemory 実装のみを提供する。
 */
import { PASSWORD_HISTORY_SIZE } from './password-policy'

/**
 * パスワード履歴の 1 件。
 *
 * - hash: bcrypt によるハッシュ (平文は持たない)
 * - createdAt: 設定された時刻 (並び替えの基準)
 */
export interface PasswordHistoryRecord {
  readonly userId: string
  readonly hash: string
  readonly createdAt: Date
}

export interface PasswordHistoryRepository {
  /**
   * 指定ユーザーの履歴を新しい順 (createdAt 降順) で最大 limit 件返す。
   * limit <= 0 のときは空配列。
   */
  listRecent(userId: string, limit: number): Promise<readonly PasswordHistoryRecord[]>

  /**
   * 履歴を 1 件追加する。
   * 追加後、ユーザー単位で新しい順 PASSWORD_HISTORY_SIZE 件のみを保持するよう
   * 古い履歴を内部で剪定する (Req 1.13)。
   */
  add(record: PasswordHistoryRecord): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory implementation
// ─────────────────────────────────────────────────────────────────────────────

function cloneRecord(record: PasswordHistoryRecord): PasswordHistoryRecord {
  return {
    userId: record.userId,
    hash: record.hash,
    createdAt: new Date(record.createdAt),
  }
}

/** createdAt 降順 (新しい順) で比較 */
function byNewestFirst(a: PasswordHistoryRecord, b: PasswordHistoryRecord): number {
  return b.createdAt.getTime() - a.createdAt.getTime()
}

class InMemoryPasswordHistoryRepository implements PasswordHistoryRepository {
  private readonly byUser: Map<string, PasswordHistoryRecord[]>

  constructor(seed?: readonly PasswordHistoryRecord[]) {
    this.byUser = new Map()
    if (seed) {
      for (const record of seed) {
        this.pushInternal(record)
      }
      for (const [userId] of this.byUser) {
        this.pruneInternal(userId)
      }
    }
  }

  async listRecent(userId: string, limit: number): Promise<readonly PasswordHistoryRecord[]> {
    if (limit <= 0) return []
    const list = this.byUser.get(userId)
    if (!list || list.length === 0) return []
    const sorted = [...list].sort(byNewestFirst)
    return sorted.slice(0, limit).map(cloneRecord)
  }

  async add(record: PasswordHistoryRecord): Promise<void> {
    this.pushInternal(record)
    this.pruneInternal(record.userId)
  }

  private pushInternal(record: PasswordHistoryRecord): void {
    const existing = this.byUser.get(record.userId) ?? []
    existing.push(cloneRecord(record))
    this.byUser.set(record.userId, existing)
  }

  private pruneInternal(userId: string): void {
    const list = this.byUser.get(userId)
    if (!list) return
    if (list.length <= PASSWORD_HISTORY_SIZE) return
    const kept = [...list].sort(byNewestFirst).slice(0, PASSWORD_HISTORY_SIZE)
    this.byUser.set(userId, kept)
  }
}

export function createInMemoryPasswordHistoryRepository(
  seed?: readonly PasswordHistoryRecord[],
): PasswordHistoryRepository {
  return new InMemoryPasswordHistoryRepository(seed)
}
