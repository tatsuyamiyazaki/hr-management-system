/**
 * AIUsageRepository
 *
 * AIUsageEntry / AIUsageFailure の永続化インターフェース。
 * 本タスクでは InMemory 実装のみ提供。Prisma 実装は DB 整備後に別タスクで追加する。
 *
 * 関連要件: Req 19.1, Req 19.6
 */
import type { AIUsageEntry, AIUsageFailure, DateRange } from './ai-usage-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIUsageRepository {
  /** 成功呼び出しを 1 件記録する */
  create(entry: AIUsageEntry): Promise<void>

  /** 失敗呼び出しを 1 件記録する (Req 19.6) */
  createFailure(entry: AIUsageFailure): Promise<void>

  /**
   * 期間内の成功呼び出しを createdAt 昇順で返す。
   * - range.from: inclusive
   * - range.to:   exclusive (半開区間)
   */
  listByDateRange(range: DateRange): Promise<readonly AIUsageEntry[]>

  /** 指定ユーザーの期間内の成功呼び出しを createdAt 昇順で返す */
  listByUser(userId: string, range: DateRange): Promise<readonly AIUsageEntry[]>

  /** 期間内の失敗呼び出しを createdAt 昇順で返す */
  listFailuresByDateRange(range: DateRange): Promise<readonly AIUsageFailure[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function cloneEntry(entry: AIUsageEntry): AIUsageEntry {
  return { ...entry, createdAt: new Date(entry.createdAt.getTime()) }
}

function cloneFailure(entry: AIUsageFailure): AIUsageFailure {
  return { ...entry, createdAt: new Date(entry.createdAt.getTime()) }
}

function isWithinRange(createdAt: Date, range: DateRange): boolean {
  const t = createdAt.getTime()
  return t >= range.from.getTime() && t < range.to.getTime()
}

function sortByCreatedAtAsc<T extends { createdAt: Date }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory 実装
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryAIUsageRepository implements AIUsageRepository {
  private readonly entries: AIUsageEntry[]
  private readonly failures: AIUsageFailure[]

  constructor(seed?: { entries?: readonly AIUsageEntry[]; failures?: readonly AIUsageFailure[] }) {
    this.entries = []
    this.failures = []
    if (seed?.entries) {
      for (const e of seed.entries) this.entries.push(cloneEntry(e))
    }
    if (seed?.failures) {
      for (const f of seed.failures) this.failures.push(cloneFailure(f))
    }
  }

  async create(entry: AIUsageEntry): Promise<void> {
    this.entries.push(cloneEntry(entry))
  }

  async createFailure(entry: AIUsageFailure): Promise<void> {
    this.failures.push(cloneFailure(entry))
  }

  async listByDateRange(range: DateRange): Promise<readonly AIUsageEntry[]> {
    const matched = this.entries.filter((e) => isWithinRange(e.createdAt, range)).map(cloneEntry)
    return sortByCreatedAtAsc(matched)
  }

  async listByUser(userId: string, range: DateRange): Promise<readonly AIUsageEntry[]> {
    const matched = this.entries
      .filter((e) => e.userId === userId && isWithinRange(e.createdAt, range))
      .map(cloneEntry)
    return sortByCreatedAtAsc(matched)
  }

  async listFailuresByDateRange(range: DateRange): Promise<readonly AIUsageFailure[]> {
    const matched = this.failures.filter((f) => isWithinRange(f.createdAt, range)).map(cloneFailure)
    return sortByCreatedAtAsc(matched)
  }
}

export function createInMemoryAIUsageRepository(seed?: {
  entries?: readonly AIUsageEntry[]
  failures?: readonly AIUsageFailure[]
}): AIUsageRepository {
  return new InMemoryAIUsageRepository(seed)
}
