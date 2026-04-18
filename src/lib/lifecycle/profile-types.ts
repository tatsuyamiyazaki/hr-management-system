/**
 * Issue #37 / Req 14.5, 14.6: プロフィール型定義
 *
 * - ProfileInput: プロフィール編集入力（Zod スキーマ付き）
 * - ProfileView: 閲覧者ロールに応じたプロフィール表示 DTO
 * - ProfileRecord: リポジトリが返すプロフィールレコード
 * - ドメイン例外: ProfileNotFoundError
 */
import { z } from 'zod'
import type { UserRole } from '@/lib/notification/notification-types'
import type { AuthUserStatus } from '@/lib/auth/user-repository'

// ─────────────────────────────────────────────────────────────────────────────
// ProfileInput (Req 14.5: 編集可能フィールド)
// ─────────────────────────────────────────────────────────────────────────────

export const profileInputSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  firstNameKana: z.string().nullable().optional(),
  lastNameKana: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  selfIntro: z.string().max(500).nullable().optional(),
  locale: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
})

/** プロフィール編集入力 */
export type ProfileInput = z.infer<typeof profileInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// ProfileRecord (リポジトリが返す全フィールド)
// ─────────────────────────────────────────────────────────────────────────────

/** リポジトリから取得するプロフィールレコード（全フィールド含む） */
export interface ProfileRecord {
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly firstNameKana: string | null
  readonly lastNameKana: string | null
  readonly employeeCode: string | null
  readonly phoneNumber: string | null
  readonly avatarUrl: string | null
  readonly selfIntro: string | null
  readonly email: string
  readonly locale: string
  readonly timezone: string
  readonly role: UserRole
  readonly status: AuthUserStatus
  readonly hireDate: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfileView (Req 14.6: ロール別表示 DTO)
// ─────────────────────────────────────────────────────────────────────────────

/** 基本情報ビュー（ADMIN 以外 / 自分以外） */
export interface ProfileViewBasic {
  readonly kind: 'basic'
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly avatarUrl: string | null
  readonly selfIntro: string | null
}

/** 全項目ビュー（ADMIN または自分自身） */
export interface ProfileViewFull {
  readonly kind: 'full'
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly firstNameKana: string | null
  readonly lastNameKana: string | null
  readonly employeeCode: string | null
  readonly phoneNumber: string | null
  readonly avatarUrl: string | null
  readonly selfIntro: string | null
  readonly email: string
  readonly locale: string
  readonly timezone: string
  readonly role: UserRole
  readonly status: AuthUserStatus
  readonly hireDate: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** ロール別プロフィールビュー */
export type ProfileView = ProfileViewBasic | ProfileViewFull

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 対象プロフィールが存在しない */
export class ProfileNotFoundError extends Error {
  public readonly userId: string

  constructor(userId: string) {
    super(`Profile not found: ${userId}`)
    this.name = 'ProfileNotFoundError'
    this.userId = userId
  }
}
