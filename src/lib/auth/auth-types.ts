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
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { USER_ROLES, type UserRole }
