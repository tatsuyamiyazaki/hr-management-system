/**
 * Task 6.5 / Req 1.10: ユーザー招待サービス
 *
 * - inviteUser: ADMIN が新規ユーザーを招待し、招待メールを送信する
 * - acceptInvitation: 招待トークンを使って初回パスワードを設定し、アカウントを有効化する
 *
 * Prisma 実装への差し替えは後続タスクで行う。
 */
import { randomUUID } from 'node:crypto'
import { computeEmailHash } from '@/lib/shared/crypto'
import { assertPasswordStrong } from './password-policy'
import type { PasswordHasher } from './password-hasher'
import type { InvitationTokenRepository } from './invitation-token-repository'
import type { WritableAuthUserRepository } from './user-repository'
import {
  INVITATION_TTL_MS,
  EmailAlreadyExistsError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  type InviteUserInput,
} from './invitation-types'

// ─────────────────────────────────────────────────────────────────────────────
// Ports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 招待メール送信の narrow port。
 * 実際のメール送信実装（Resend / SendGrid 等）は後続タスクで差し替える。
 */
export interface InvitationEmailSender {
  sendInvitationEmail(params: {
    readonly to: string
    readonly token: string
    readonly role: string
  }): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface InvitationService {
  /**
   * ADMIN が新規ユーザーを招待する (Req 1.10)。
   * - PENDING_JOIN ユーザーを作成し、招待トークンを生成してメールを送信する。
   * - 同一メールが既に存在する場合は EmailAlreadyExistsError。
   */
  inviteUser(input: InviteUserInput, invitedByUserId: string): Promise<void>

  /**
   * 招待トークンを使って初回パスワードを設定し、アカウントを有効化する (Req 1.10)。
   * - トークン未存在: InvitationNotFoundError
   * - 有効期限切れ: InvitationExpiredError
   * - 使用済み: InvitationAlreadyUsedError
   * - パスワードポリシー違反: PasswordPolicyViolationError
   */
  acceptInvitation(token: string, password: string, now?: Date): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface InvitationServiceDeps {
  readonly tokens: InvitationTokenRepository
  readonly users: WritableAuthUserRepository
  readonly passwordHasher: PasswordHasher
  readonly emailSender: InvitationEmailSender
  readonly appSecret: string
  readonly userIdFactory?: () => string
  readonly tokenFactory?: () => string
  readonly clock?: () => Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

function defaultClock(): Date {
  return new Date()
}

class InvitationServiceImpl implements InvitationService {
  private readonly tokens: InvitationTokenRepository
  private readonly users: WritableAuthUserRepository
  private readonly passwordHasher: PasswordHasher
  private readonly emailSender: InvitationEmailSender
  private readonly appSecret: string
  private readonly userIdFactory: () => string
  private readonly tokenFactory: () => string
  private readonly clock: () => Date

  constructor(deps: InvitationServiceDeps) {
    this.tokens = deps.tokens
    this.users = deps.users
    this.passwordHasher = deps.passwordHasher
    this.emailSender = deps.emailSender
    this.appSecret = deps.appSecret
    this.userIdFactory = deps.userIdFactory ?? randomUUID
    this.tokenFactory = deps.tokenFactory ?? randomUUID
    this.clock = deps.clock ?? defaultClock
  }

  async inviteUser(input: InviteUserInput, invitedByUserId: string): Promise<void> {
    const emailHash = await computeEmailHash(input.email, this.appSecret)

    // 既存ユーザーとの重複チェック
    const existing = await this.users.findByEmailHash(emailHash)
    if (existing) {
      throw new EmailAlreadyExistsError()
    }

    const now = this.clock()
    const userId = this.userIdFactory()
    const token = this.tokenFactory()

    // PENDING_JOIN ステータスで仮ユーザーを作成
    await this.users.createUser({
      id: userId,
      email: input.email,
      emailHash,
      passwordHash: '',
      role: input.role,
      status: 'PENDING_JOIN',
    })

    // 招待トークンを生成・保存
    await this.tokens.create({
      token,
      email: input.email,
      emailHash,
      role: input.role,
      invitedByUserId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      usedAt: null,
    })

    // 招待メールを送信
    await this.emailSender.sendInvitationEmail({
      to: input.email,
      token,
      role: input.role,
    })
  }

  async acceptInvitation(token: string, password: string, now?: Date): Promise<void> {
    const record = await this.tokens.findByToken(token)
    if (!record) {
      throw new InvitationNotFoundError(token)
    }

    if (record.usedAt !== null) {
      throw new InvitationAlreadyUsedError()
    }

    const currentTime = now ?? this.clock()
    if (currentTime > record.expiresAt) {
      throw new InvitationExpiredError()
    }

    // パスワードポリシー検証 (LENGTH, COMPLEXITY)
    assertPasswordStrong(password)

    // 対象ユーザーを emailHash で取得して userId を確定する
    const user = await this.users.findByEmailHash(record.emailHash)
    if (!user) {
      throw new InvitationNotFoundError(token)
    }

    const newHash = await this.passwordHasher.hash(password)

    // パスワードをセットしてアカウントを有効化
    await this.users.updatePasswordHash(user.id, newHash)
    await this.users.updateStatus(user.id, 'ACTIVE')

    // トークンを使用済みにマーク
    await this.tokens.markUsed(token, currentTime)
  }
}

export function createInvitationService(deps: InvitationServiceDeps): InvitationService {
  return new InvitationServiceImpl(deps)
}
