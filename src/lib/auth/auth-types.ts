/**
 * Task 6.1: NextAuth v5 ログイン・セッション管理
 *
 * 認証まわりの共通型・ドメイン例外・Zod スキーマを集約する。
 *
 * - LoginInput: ログインフォーム入力 (Zod で検証)
 * - AuthenticatedUser: 認可済みユーザ情報 (UI/コールバック渡し用)
 * - Session: Redis/InMemory セッションストアの 1 レコード
 * - ドメイン例外: InvalidCredentialsError, UserNotFoundError,
 *   SessionExpiredError, SessionIdleTimeoutError, SessionNotFoundError
 */
import { z } from 'zod'
import { USER_ROLES, type UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** ログイン入力 (メール + パスワード) */
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type LoginInput = z.infer<typeof loginInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 認可済みユーザー情報。
 * NextAuth の JWT / session コールバックで扱う最小限のユーザープロフィール。
 */
export interface AuthenticatedUser {
  readonly id: string
  /** 平文メール (復号済み、UI 表示用) */
  readonly email: string
  readonly role: UserRole
}

/**
 * サーバー側で管理するセッションレコード。
 * Redis/InMemory いずれのストアでも同じ形で保持する。
 */
export interface Session {
  /** セッション ID (UUID, stateless な識別子) */
  readonly id: string
  readonly userId: string
  readonly role: UserRole
  /** プロフィール表示用の平文メール */
  readonly email: string
  /** セッション発行日時 */
  readonly createdAt: Date
  /**
   * 絶対期限。createdAt + 8h (SESSION_ABSOLUTE_TTL_MS)。
   * Req 1.4: 8 時間を超えた場合に自動ログアウトする。
   */
  readonly expiresAt: Date
  /**
   * 最終アクセス日時。touch 呼び出しで更新される。
   * Req 1.5: 30 分間無操作でアイドルタイムアウトする。
   */
  readonly lastAccessAt: Date
  /** 監査ログ/セッション一覧 (Req 1.14) で利用するメタ情報 */
  readonly ipAddress?: string
  readonly userAgent?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 認証失敗。
 * メール未登録・パスワード不一致・非アクティブ状態いずれも本例外で統一する。
 * ユーザー存在の漏洩を防ぐため呼び出し側では区別しないこと。
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials')
    this.name = 'InvalidCredentialsError'
  }
}

/**
 * ユーザー ID 起点の検索でレコードが見つからない場合。
 * 管理者用途など、認証失敗と区別したい場面でのみ使う。
 */
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
  }
}

/** セッションの絶対期限切れ (Req 1.4) */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
    this.name = 'SessionExpiredError'
  }
}

/** セッションのアイドル期限切れ (Req 1.5) */
export class SessionIdleTimeoutError extends Error {
  constructor() {
    super('Session idle timeout')
    this.name = 'SessionIdleTimeoutError'
  }
}

/** セッションが存在しない (未発行 / 明示的に削除済み) */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`)
    this.name = 'SessionNotFoundError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 6.2 / Req 1.3, 1.12, 1.13: パスワードポリシー & アカウントロック
// ─────────────────────────────────────────────────────────────────────────────

/**
 * パスワードポリシー違反の詳細ルール識別子。
 * - LENGTH: 最低長 (12 文字) 未満 (Req 1.12)
 * - COMPLEXITY: 英大文字 / 英小文字 / 数字 / 記号のうち 3 種未満 (Req 1.12)
 * - REUSED: 過去 5 世代以内のパスワードと同一 (Req 1.13)
 */
export const PASSWORD_POLICY_RULES = ['LENGTH', 'COMPLEXITY', 'REUSED'] as const
export type PasswordPolicyRule = (typeof PASSWORD_POLICY_RULES)[number]

/**
 * パスワードポリシー違反 (Req 1.12, 1.13)。
 * rule で違反理由を保持し、呼び出し側はそれを見て UI メッセージを出し分ける。
 */
export class PasswordPolicyViolationError extends Error {
  public readonly rule: PasswordPolicyRule

  constructor(rule: PasswordPolicyRule) {
    super(`Password policy violation: ${rule}`)
    this.name = 'PasswordPolicyViolationError'
    this.rule = rule
  }
}

/**
 * アカウントロック状態 (Req 1.3)。
 * lockedUntil には解除予定時刻が入る。認証層はこの時刻まで login を拒否する。
 */
export class AccountLockedError extends Error {
  public readonly lockedUntil: Date

  constructor(lockedUntil: Date) {
    super('Account is locked')
    this.name = 'AccountLockedError'
    this.lockedUntil = lockedUntil
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { USER_ROLES, type UserRole }
