/**
 * Task 6.2 / Req 1.12, 1.13: パスワード変更ユースケース集約
 *
 * 責務:
 *   1. ポリシー強度検証 (assertPasswordStrong)
 *   2. 過去 PASSWORD_HISTORY_SIZE 世代との再利用チェック (Req 1.13)
 *   3. bcrypt ハッシュ化
 *   4. User レコードへの反映 (PasswordPersistencePort)
 *   5. 履歴追加
 *
 * Prisma 実装層は PasswordPersistencePort / PasswordHistoryRepository を
 * 後続タスクで差し替える。
 */
import { PasswordPolicyViolationError } from './auth-types'
import type { PasswordHasher } from './password-hasher'
import type { PasswordHistoryRepository } from './password-history-repository'
import { PASSWORD_HISTORY_SIZE, assertPasswordStrong } from './password-policy'

export interface ChangePasswordInput {
  readonly userId: string
  readonly newPassword: string
}

export interface ChangePasswordResult {
  readonly newHash: string
}

export interface PasswordService {
  /**
   * ポリシー検証 + 過去履歴チェック + ハッシュ化 + 保存 + 履歴追加。
   * 違反時は PasswordPolicyViolationError をそのまま throw し、永続化は行わない。
   */
  changePassword(input: ChangePasswordInput, now?: Date): Promise<ChangePasswordResult>
}

/**
 * User レコードの passwordHash 更新を担うアダプタ。
 * Prisma 実装は後続タスクで追加する。
 */
export interface PasswordPersistencePort {
  updateUserPasswordHash(userId: string, newHash: string): Promise<void>
}

export interface PasswordServiceDeps {
  readonly hasher: PasswordHasher
  readonly history: PasswordHistoryRepository
  readonly persist: PasswordPersistencePort
  readonly clock?: () => Date
}

function defaultClock(): Date {
  return new Date()
}

class PasswordServiceImpl implements PasswordService {
  private readonly hasher: PasswordHasher
  private readonly history: PasswordHistoryRepository
  private readonly persist: PasswordPersistencePort
  private readonly clock: () => Date

  constructor(deps: PasswordServiceDeps) {
    this.hasher = deps.hasher
    this.history = deps.history
    this.persist = deps.persist
    this.clock = deps.clock ?? defaultClock
  }

  async changePassword(input: ChangePasswordInput, now?: Date): Promise<ChangePasswordResult> {
    // 1. 強度ポリシー (LENGTH → COMPLEXITY)
    assertPasswordStrong(input.newPassword)

    // 2. 過去履歴を取得 (Req 1.13: 過去 5 世代)
    const recent = await this.history.listRecent(input.userId, PASSWORD_HISTORY_SIZE)

    // 3. 履歴のいずれかに一致したら再利用エラー
    for (const record of recent) {
      const isReused = await this.hasher.verify(input.newPassword, record.hash)
      if (isReused) {
        throw new PasswordPolicyViolationError('REUSED')
      }
    }

    // 4. 新ハッシュを計算
    const newHash = await this.hasher.hash(input.newPassword)

    // 5. User レコードへ反映
    await this.persist.updateUserPasswordHash(input.userId, newHash)

    // 6. 履歴を追加 (内部で PASSWORD_HISTORY_SIZE を超える古いものは剪定される)
    const createdAt = now ?? this.clock()
    await this.history.add({ userId: input.userId, hash: newHash, createdAt })

    return { newHash }
  }
}

export function createPasswordService(deps: PasswordServiceDeps): PasswordService {
  return new PasswordServiceImpl(deps)
}
