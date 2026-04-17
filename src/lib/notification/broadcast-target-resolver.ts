import type { BroadcastTarget } from './notification-types'
import { BroadcastGroupNotFoundError } from './custom-broadcast-service'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** 通知の配信対象となる単一のユーザー（メールアドレス付き） */
export interface BroadcastRecipient {
  readonly userId: string
  readonly email: string
}

/**
 * 送信対象ユーザーを解決する。
 * 将来的には UserRepository / GroupRepository が実装を提供する想定。
 */
export interface BroadcastTargetResolver {
  resolve(target: BroadcastTarget): Promise<readonly BroadcastRecipient[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemory 実装（テスト用）
// ─────────────────────────────────────────────────────────────────────────────

interface InMemorySeed {
  readonly allUsers: readonly BroadcastRecipient[]
  readonly groups: ReadonlyMap<string, readonly BroadcastRecipient[]>
}

class InMemoryBroadcastTargetResolver implements BroadcastTargetResolver {
  private readonly allUsers: readonly BroadcastRecipient[]
  private readonly groups: ReadonlyMap<string, readonly BroadcastRecipient[]>

  constructor(seed: InMemorySeed) {
    // 外部からの変更を遮断するため防御的コピーで保持する
    this.allUsers = [...seed.allUsers]
    const cloned = new Map<string, readonly BroadcastRecipient[]>()
    for (const [groupId, members] of seed.groups) {
      cloned.set(groupId, [...members])
    }
    this.groups = cloned
  }

  async resolve(target: BroadcastTarget): Promise<readonly BroadcastRecipient[]> {
    if (target.type === 'ALL') {
      // 毎回新しい配列を返し、呼び出し側に内部参照を露出させない
      return [...this.allUsers]
    }

    const members = this.groups.get(target.groupId)
    if (!members) {
      throw new BroadcastGroupNotFoundError(target.groupId)
    }
    return [...members]
  }
}

/** テスト用 InMemory 実装を生成する */
export function createInMemoryBroadcastTargetResolver(seed: InMemorySeed): BroadcastTargetResolver {
  return new InMemoryBroadcastTargetResolver(seed)
}
