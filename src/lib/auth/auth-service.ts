/**
 * Task 6.1: 認証サービス (login / logout / session 取得 / touch)
 *
 * - Req 1.1 / 1.2: メール + パスワードによる認証とセッション発行
 * - Req 1.4 / 1.5: 絶対期限・アイドル期限切れ判定は SessionStore 側に委譲
 * - Req 1.6: logout でセッションを即時削除
 * - Req 1.11: パスワード検証は PasswordHasher (bcrypt) を経由
 *
 * 認証失敗は常に InvalidCredentialsError に丸め、ユーザー存在有無の漏洩を防ぐ。
 */
import { randomUUID } from 'node:crypto'
import { computeEmailHash } from '@/lib/shared/crypto'
import {
  InvalidCredentialsError,
  loginInputSchema,
  type LoginInput,
  type Session,
} from './auth-types'
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

export interface AuthServiceDeps {
  readonly users: AuthUserRepository
  readonly sessions: SessionStore
  readonly passwordHasher: PasswordHasher
  /** emailHash 計算用 (APP_SECRET をハードコードせず注入) */
  readonly appSecret: string
  readonly sessionIdFactory?: () => string
  readonly clock?: () => Date
  readonly absoluteTtlMs?: number
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
  }

  async login(input: LoginInput, context?: LoginContext, now?: Date): Promise<Session> {
    // Zod バリデーション (email 形式 / password 必須)
    const parsed = loginInputSchema.parse(input)

    const emailHash = await computeEmailHash(parsed.email, this.appSecret)
    const user = await this.users.findByEmailHash(emailHash)
    // ユーザー不在・非アクティブ・パスワード不一致は全て InvalidCredentialsError に統一する
    if (!user) {
      throw new InvalidCredentialsError()
    }
    if (user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError()
    }

    const passwordOk = await this.passwordHasher.verify(parsed.password, user.passwordHash)
    if (!passwordOk) {
      throw new InvalidCredentialsError()
    }

    const issuedAt = now ?? this.clock()
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
