/**
 * Task 6.1: 認証ユースケースが必要とする最小限のユーザー取得ポート。
 *
 * Prisma 実装は Task 6.x 以降で追加する。本タスクでは InMemory 実装のみを提供し、
 * 業務ロジック層は narrow なインターフェースに依存する。
 */
import type { UserRole } from '@/lib/notification/notification-types'

/** ユーザーの在籍ステータス (Prisma schema の UserStatus と同一ラベル) */
export type AuthUserStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'PENDING_JOIN'

export const AUTH_USER_STATUSES: readonly AuthUserStatus[] = [
  'ACTIVE',
  'ON_LEAVE',
  'RESIGNED',
  'PENDING_JOIN',
] as const

/**
 * 認証時に参照するユーザーレコード。
 *
 * - email は平文 (Prisma 実装では @encrypted から復号済みを想定)
 * - emailHash は HMAC-SHA256 によるブラインドインデックス (crypto.ts で生成)
 * - passwordHash は bcrypt (コスト 12+)
 */
export interface AuthUserRecord {
  readonly id: string
  readonly emailHash: string
  readonly email: string
  readonly passwordHash: string
  readonly role: UserRole
  readonly status: AuthUserStatus
}

/**
 * 認証で用いる最小限のリポジトリ。findByEmailHash が主たる入口。
 */
export interface AuthUserRepository {
  findByEmailHash(emailHash: string): Promise<AuthUserRecord | null>
  findById(id: string): Promise<AuthUserRecord | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory implementation (tests / local dev)
// ─────────────────────────────────────────────────────────────────────────────

function cloneRecord(record: AuthUserRecord): AuthUserRecord {
  return { ...record }
}

class InMemoryAuthUserRepository implements AuthUserRepository {
  private readonly byEmailHash: Map<string, AuthUserRecord>
  private readonly byId: Map<string, AuthUserRecord>

  constructor(seed?: readonly AuthUserRecord[]) {
    this.byEmailHash = new Map()
    this.byId = new Map()
    if (seed) {
      for (const record of seed) {
        const copy = cloneRecord(record)
        this.byEmailHash.set(copy.emailHash, copy)
        this.byId.set(copy.id, copy)
      }
    }
  }

  async findByEmailHash(emailHash: string): Promise<AuthUserRecord | null> {
    const found = this.byEmailHash.get(emailHash)
    return found ? cloneRecord(found) : null
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const found = this.byId.get(id)
    return found ? cloneRecord(found) : null
  }
}

export function createInMemoryAuthUserRepository(
  seed?: readonly AuthUserRecord[],
): AuthUserRepository {
  return new InMemoryAuthUserRepository(seed)
}
