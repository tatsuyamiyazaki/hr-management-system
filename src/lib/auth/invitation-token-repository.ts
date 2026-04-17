/**
 * Task 6.5 / Req 1.10: 招待トークンリポジトリ
 *
 * - InvitationTokenRepository: create / findByToken / markUsed の narrow port
 * - InMemoryInvitationTokenRepository: テスト / ローカル開発用の実装
 *   Prisma 実装は後続タスクで追加する。
 */
import type { InvitationToken } from './invitation-types'

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

export interface InvitationTokenRepository {
  create(record: InvitationToken): Promise<void>
  findByToken(token: string): Promise<InvitationToken | null>
  markUsed(token: string, usedAt: Date): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory implementation
// ─────────────────────────────────────────────────────────────────────────────

function clone(record: InvitationToken): InvitationToken {
  return { ...record }
}

class InMemoryInvitationTokenRepository implements InvitationTokenRepository {
  private readonly store = new Map<string, InvitationToken>()

  async create(record: InvitationToken): Promise<void> {
    this.store.set(record.token, clone(record))
  }

  async findByToken(token: string): Promise<InvitationToken | null> {
    const found = this.store.get(token)
    return found ? clone(found) : null
  }

  async markUsed(token: string, usedAt: Date): Promise<void> {
    const existing = this.store.get(token)
    if (!existing) return
    this.store.set(token, { ...existing, usedAt })
  }
}

export function createInMemoryInvitationTokenRepository(): InvitationTokenRepository {
  return new InMemoryInvitationTokenRepository()
}
