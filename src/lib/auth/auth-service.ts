/**
 * Task 6.1: 認証サービス (login / logout / session 取得 / touch)
 * Task 6.2: アカウントロックアウト + ロック通知 + 監査ログ (Req 1.3)
 *
 * - Req 1.1 / 1.2: メール + パスワードによる認証とセッション発行
 * - Req 1.3: 5 回連続失敗で 15 分ロック + 通知 (lockout / notifier / auditLogger は optional)
 * - Req 1.4 / 1.5: 絶対期限・アイドル期限切れ判定は SessionStore 側に委譲
 * - Req 1.6: logout でセッションを即時削除
 * - Req 1.11: パスワード検証は PasswordHasher (bcrypt) を経由
 *
 * 認証失敗は常に InvalidCredentialsError に丸め、ユーザー存在有無の漏洩を防ぐ。
 * ロック中アカウントのみ AccountLockedError を返し、解除時刻を呼び出し側に伝える。
 */
import { randomUUID } from 'node:crypto'
import { computeEmailHash } from '@/lib/shared/crypto'
import {
  AccountLockedError,
  InvalidCredentialsError,
  loginInputSchema,
  type LoginInput,
  type Session,
} from './auth-types'
import type { LockoutNotifier } from './lockout-notifier'
import type { LockoutStatus, LockoutStore } from './lockout-store'
import type { PasswordHasher } from './password-hasher'
import { SESSION_ABSOLUTE_TTL_MS } from './session-store'
import type { SessionStore } from './session-store'
import type { AuthUserRepository } from './user-repository'

export interface LoginContext {
  readonly ipAddress?: string
  readonly userAgent?: string
}

export interface AuthService {
  /** 成功で Session を返す。失敗は InvalidCredentialsError で統一 */
  login(input: LoginInput, context?: LoginContext, now?: Date): Promise<Session>
  /** セッションを即時失効する (Req 1.6) */
  logout(sessionId: string): Promise<void>
  /** 有効なセッションを返す。期限切れ/アイドルは例外 */
  getSession(sessionId: string, now?: Date): Promise<Session>
  /** 有効性確認したうえで lastAccessAt を更新する */
  touchSession(sessionId: string, now?: Date): Promise<Session>
}

/**
 * 監査ログ出力の narrow port。
 * 既存 AuditLogEmitter (src/lib/audit/audit-log-emitter.ts) と互換な shape。
 * AuthService は fire-and-forget で呼び、監査失敗は認証を止めない。
 */
export interface AuthAuditLoggerPort {
  emit(entry: {
    readonly userId: string | null
    readonly action: 'ACCOUNT_LOCKED'
    readonly resourceType: 'USER'
    readonly resourceId: string | null
    readonly ipAddress: string
    readonly userAgent: string
    readonly before: Record<string, unknown> | null
    readonly after: Record<string, unknown> | null
  }): Promise<void>
}

export interface AuthServiceDeps {
  readonly users: AuthUserRepository
  readonly sessions: SessionStore
  readonly passwordHasher: PasswordHasher
  /** emailHash 計算用 (APP_SECRET をハードコードせず注入) */
  readonly appSecret: string
  readonly sessionIdFactory?: () => string
  readonly clock?: () => Date
  readonly absoluteTtlMs?: number
  /**
   * Task 6.2 / Req 1.3: 連続ログイン失敗の追跡とロック判定。
   * 未指定時はロックアウト機能は動作しない (後方互換)。
   */
  readonly lockout?: LockoutStore
  /** Task 6.2 / Req 1.3: ロック通知メール。未指定時は通知を送らない */
  readonly notifier?: LockoutNotifier
  /** Task 6.2: ACCOUNT_LOCKED の監査ログ。未指定時は監査出力なし */
  readonly auditLogger?: AuthAuditLoggerPort
}

function defaultSessionIdFactory(): string {
  return randomUUID()
}

function defaultClock(): Date {
  return new Date()
}

class AuthServiceImpl implements AuthService {
  private readonly users: AuthUserRepository
  private readonly sessions: SessionStore
  private readonly passwordHasher: PasswordHasher
  private readonly appSecret: string
  private readonly sessionIdFactory: () => string
  private readonly clock: () => Date
  private readonly absoluteTtlMs: number
  private readonly lockout?: LockoutStore
  private readonly notifier?: LockoutNotifier
  private readonly auditLogger?: AuthAuditLoggerPort

  constructor(deps: AuthServiceDeps) {
    if (typeof deps.appSecret !== 'string' || deps.appSecret.length === 0) {
      throw new Error('appSecret must be a non-empty string')
    }
    this.users = deps.users
    this.sessions = deps.sessions
    this.passwordHasher = deps.passwordHasher
    this.appSecret = deps.appSecret
    this.sessionIdFactory = deps.sessionIdFactory ?? defaultSessionIdFactory
    this.clock = deps.clock ?? defaultClock
    this.absoluteTtlMs = deps.absoluteTtlMs ?? SESSION_ABSOLUTE_TTL_MS
    this.lockout = deps.lockout
    this.notifier = deps.notifier
    this.auditLogger = deps.auditLogger
  }

  async login(input: LoginInput, context?: LoginContext, now?: Date): Promise<Session> {
    // Zod バリデーション (email 形式 / password 必須)
    const parsed = loginInputSchema.parse(input)
    const issuedAt = now ?? this.clock()

    const emailHash = await computeEmailHash(parsed.email, this.appSecret)
    const user = await this.users.findByEmailHash(emailHash)
    // ユーザー不在は InvalidCredentialsError に統一 (存在漏洩防止)。
    // 存在しないユーザーの userId は特定できないため、lockout も記録しない。
    if (!user) {
      throw new InvalidCredentialsError()
    }

    // Req 1.3: 既にロック中ならパスワードが正しくても拒否 (AccountLockedError)
    if (this.lockout) {
      const status = await this.lockout.get(user.id, issuedAt)
      if (status.lockedUntil !== null && status.lockedUntil.getTime() > issuedAt.getTime()) {
        throw new AccountLockedError(new Date(status.lockedUntil))
      }
    }

    if (user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError()
    }

    const passwordOk = await this.passwordHasher.verify(parsed.password, user.passwordHash)
    if (!passwordOk) {
      await this.handleFailedAttempt(user.id, user.email, issuedAt, context)
      throw new InvalidCredentialsError()
    }

    // 成功ログイン: 連続失敗カウンタを全リセット (Req 1.3)
    if (this.lockout) {
      await this.lockout.reset(user.id)
    }

    const session: Session = {
      id: this.sessionIdFactory(),
      userId: user.id,
      role: user.role,
      email: user.email,
      createdAt: issuedAt,
      expiresAt: new Date(issuedAt.getTime() + this.absoluteTtlMs),
      lastAccessAt: issuedAt,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    }
    await this.sessions.create(session)
    return session
  }

  /**
   * パスワード不一致時のロックアウト記録。
   * 新たに閾値到達した瞬間のみ通知 + 監査ログを発火する。
   */
  private async handleFailedAttempt(
    userId: string,
    email: string,
    now: Date,
    context?: LoginContext,
  ): Promise<void> {
    if (!this.lockout) return

    const updated: LockoutStatus = await this.lockout.recordFailure(userId, now)
    // 新規ロック = lockedUntil が未来で設定されている状態。
    // 既にロック中なら recordFailure は状態を変えない (status.failedCount は変わらず) が、
    // AuthService では既ロック中は先頭の lockout.get で弾かれているため
    // ここに到達したら必ず "今回新たにロックされた" ケース。
    const isNewlyLocked =
      updated.lockedUntil !== null && updated.lockedUntil.getTime() > now.getTime()

    if (!isNewlyLocked) return

    const lockedUntil = new Date(updated.lockedUntil as Date)

    // 通知 (fire-and-forget エラーは ignore; 認証フローを止めない)
    if (this.notifier) {
      try {
        await this.notifier.notifyLocked({ userId, email, lockedUntil })
      } catch {
        // 通知失敗は認証フローを止めない
      }
    }

    // 監査ログ (ACCOUNT_LOCKED)
    if (this.auditLogger) {
      try {
        await this.auditLogger.emit({
          userId,
          action: 'ACCOUNT_LOCKED',
          resourceType: 'USER',
          resourceId: userId,
          ipAddress: context?.ipAddress ?? 'unknown',
          userAgent: context?.userAgent ?? 'unknown',
          before: null,
          after: {
            lockedUntil: lockedUntil.toISOString(),
            failedCount: updated.failedCount,
          },
        })
      } catch {
        // 監査失敗は認証フローを止めない
      }
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.delete(sessionId)
  }

  async getSession(sessionId: string, now?: Date): Promise<Session> {
    return this.sessions.get(sessionId, now ?? this.clock())
  }

  async touchSession(sessionId: string, now?: Date): Promise<Session> {
    return this.sessions.touch(sessionId, now ?? this.clock())
  }
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  return new AuthServiceImpl(deps)
}
