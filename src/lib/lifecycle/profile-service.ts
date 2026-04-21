/**
 * Issue #37 / Req 14.5, 14.6: プロフィールサービス
 *
 * - getProfile: 閲覧者ロールに応じたプロフィール表示（Req 14.6）
 *   - ADMIN: 全項目表示
 *   - 自分自身: 全項目表示
 *   - その他ロール: 基本情報のみ
 * - editProfile: 自分のプロフィールを編集（Req 14.5）
 *   - firstName / lastName / avatarUrl / selfIntro / phoneNumber / locale / timezone 等
 *   - 自分以外の編集は ForbiddenError
 */
import type { ProfileRepository } from './profile-repository'
import {
  profileInputSchema,
  ProfileNotFoundError,
  type ProfileInput,
  type ProfileRecord,
  type ProfileView,
  type ProfileViewBasic,
  type ProfileViewFull,
} from './profile-types'
import { PHASE1_LOCALE, PHASE1_TIMEZONE } from '@/lib/shared/locale'

// ─────────────────────────────────────────────────────────────────────────────
// Ports (閲覧者情報取得用)
// ─────────────────────────────────────────────────────────────────────────────

/** 閲覧者のロール情報を取得する narrow port */
export interface ProfileViewerRepository {
  findRoleByUserId(userId: string): Promise<{ role: string } | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileService {
  /**
   * プロフィールを閲覧する（Req 14.6）。
   * 閲覧者のロールに応じて返却する DTO を制御する。
   * - ADMIN または自分自身: 全項目 (ProfileViewFull)
   * - その他: 基本情報のみ (ProfileViewBasic)
   */
  getProfile(viewerId: string, targetUserId: string): Promise<ProfileView>

  /**
   * 自分のプロフィールを編集する（Req 14.5）。
   * - 対象プロフィールが存在しない場合は ProfileNotFoundError
   * - 呼び出し側（API / middleware）で userId が本人であることを検証すること
   */
  editProfile(userId: string, input: ProfileInput): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileServiceDeps {
  readonly profiles: ProfileRepository
  readonly viewers: ProfileViewerRepository
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 権限不足（自分以外のプロフィールを編集しようとした場合） */
export class ProfileForbiddenError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'ProfileForbiddenError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class ProfileServiceImpl implements ProfileService {
  private readonly profiles: ProfileRepository
  private readonly viewers: ProfileViewerRepository

  constructor(deps: ProfileServiceDeps) {
    this.profiles = deps.profiles
    this.viewers = deps.viewers
  }

  async getProfile(viewerId: string, targetUserId: string): Promise<ProfileView> {
    const record = await this.profiles.findByUserId(targetUserId)
    if (!record) {
      throw new ProfileNotFoundError(targetUserId)
    }

    const isSelf = viewerId === targetUserId
    if (isSelf) {
      return toFullView(record)
    }

    const viewer = await this.viewers.findRoleByUserId(viewerId)
    const isAdmin = viewer?.role === 'ADMIN'

    if (isAdmin) {
      return toFullView(record)
    }

    return toBasicView(record)
  }

  async editProfile(userId: string, input: ProfileInput): Promise<void> {
    const parsed = profileInputSchema.parse(input)

    const existing = await this.profiles.findByUserId(userId)
    if (!existing) {
      throw new ProfileNotFoundError(userId)
    }

    const { locale: _locale, timezone: _timezone, ...editableFields } = parsed

    await this.profiles.update(userId, editableFields)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO builders
// ─────────────────────────────────────────────────────────────────────────────

function toFullView(record: ProfileRecord): ProfileViewFull {
  return {
    kind: 'full',
    userId: record.userId,
    firstName: record.firstName,
    lastName: record.lastName,
    firstNameKana: record.firstNameKana,
    lastNameKana: record.lastNameKana,
    employeeCode: record.employeeCode,
    phoneNumber: record.phoneNumber,
    avatarUrl: record.avatarUrl,
    selfIntro: record.selfIntro,
    email: record.email,
    locale: PHASE1_LOCALE,
    timezone: PHASE1_TIMEZONE,
    role: record.role,
    status: record.status,
    hireDate: record.hireDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function toBasicView(record: ProfileRecord): ProfileViewBasic {
  return {
    kind: 'basic',
    userId: record.userId,
    firstName: record.firstName,
    lastName: record.lastName,
    avatarUrl: record.avatarUrl,
    selfIntro: record.selfIntro,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createProfileService(deps: ProfileServiceDeps): ProfileService {
  return new ProfileServiceImpl(deps)
}
