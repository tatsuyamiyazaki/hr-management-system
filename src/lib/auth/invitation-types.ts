/**
 * Task 6.5 / Req 1.10: ユーザー招待・パスワード設定フロー
 *
 * - InvitationToken: 招待トークンレコード (72 時間有効)
 * - inviteUserInputSchema: ADMIN がユーザーを招待する入力
 * - acceptInvitationInputSchema: 招待を承認して初回パスワードを設定する入力
 * - ドメイン例外: InvitationNotFoundError, InvitationExpiredError, InvitationAlreadyUsedError
 */
import { z } from 'zod'
import { USER_ROLES, type UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** 招待トークンの有効期限: 72 時間 */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 招待トークンレコード。
 * ADMIN がユーザーを招待した際に生成し、ストアに保存する。
 */
export interface InvitationToken {
  /** UUID (招待メール URL のパスパラメータ) */
  readonly token: string
  readonly email: string
  readonly emailHash: string
  readonly role: UserRole
  readonly invitedByUserId: string
  readonly createdAt: Date
  /** createdAt + INVITATION_TTL_MS */
  readonly expiresAt: Date
  /** 使用済み日時 (null = 未使用) */
  readonly usedAt: Date | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** ADMIN がユーザーを招待する入力 */
export const inviteUserInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(USER_ROLES),
})

export type InviteUserInput = z.infer<typeof inviteUserInputSchema>

/** 招待を承認して初回パスワードを設定する入力 */
export const acceptInvitationInputSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
})

export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 招待トークンが存在しない */
export class InvitationNotFoundError extends Error {
  constructor(token: string) {
    super(`Invitation not found: ${token}`)
    this.name = 'InvitationNotFoundError'
  }
}

/** 招待トークンの有効期限切れ */
export class InvitationExpiredError extends Error {
  constructor() {
    super('Invitation has expired')
    this.name = 'InvitationExpiredError'
  }
}

/** 招待トークンが既に使用済み */
export class InvitationAlreadyUsedError extends Error {
  constructor() {
    super('Invitation has already been used')
    this.name = 'InvitationAlreadyUsedError'
  }
}

/** 招待対象のメールアドレスが既にアクティブなユーザーとして存在する */
export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('Email already exists')
    this.name = 'EmailAlreadyExistsError'
  }
}
