/**
 * Issue #37 / Req 14.5, 14.6: プロフィールリポジトリ
 *
 * - ProfileRepository: プロフィール取得・更新の narrow port
 * - InMemoryProfileRepository: テスト用 InMemory 実装
 */
import type { ProfileInput, ProfileRecord } from './profile-types'

// ─────────────────────────────────────────────────────────────────────────────
// Port
// ─────────────────────────────────────────────────────────────────────────────

/** プロフィール取得・更新リポジトリ */
export interface ProfileRepository {
  /** userId に紐づくプロフィールレコードを取得する */
  findByUserId(userId: string): Promise<ProfileRecord | null>

  /** プロフィールを部分更新する（キーが存在するフィールドのみ上書き） */
  update(userId: string, input: ProfileInput): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory implementation (tests / local dev)
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryProfileRepository implements ProfileRepository {
  private readonly store: Map<string, ProfileRecord>

  constructor(seed?: readonly ProfileRecord[]) {
    this.store = new Map()
    if (seed) {
      for (const record of seed) {
        this.store.set(record.userId, { ...record })
      }
    }
  }

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const found = this.store.get(userId)
    return found ? { ...found } : null
  }

  async update(userId: string, input: ProfileInput): Promise<void> {
    const existing = this.store.get(userId)
    if (!existing) return

    const updated: ProfileRecord = {
      ...existing,
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.firstNameKana !== undefined && { firstNameKana: input.firstNameKana }),
      ...(input.lastNameKana !== undefined && { lastNameKana: input.lastNameKana }),
      ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.selfIntro !== undefined && { selfIntro: input.selfIntro }),
      ...(input.locale !== undefined && { locale: input.locale }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      updatedAt: new Date(),
    }
    this.store.set(userId, updated)
  }
}

export function createInMemoryProfileRepository(
  seed?: readonly ProfileRecord[],
): ProfileRepository {
  return new InMemoryProfileRepository(seed)
}
