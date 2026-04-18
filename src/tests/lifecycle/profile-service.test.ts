/**
 * Issue #37 / Req 14.5, 14.6: ProfileService の単体テスト
 *
 * - getProfile: ADMIN は全項目 / 自分自身は全項目 / 他ロールは基本情報のみ
 * - editProfile: 自分のプロフィール編集 / 存在しないユーザー / バリデーション
 */
import { describe, it, expect } from 'vitest'
import { createInMemoryProfileRepository } from '@/lib/lifecycle/profile-repository'
import type { ProfileRepository } from '@/lib/lifecycle/profile-repository'
import {
  createProfileService,
  type ProfileService,
  type ProfileViewerRepository,
} from '@/lib/lifecycle/profile-service'
import { ProfileNotFoundError, type ProfileRecord } from '@/lib/lifecycle/profile-types'

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-18T10:00:00.000Z')

function makeAliceProfile(): ProfileRecord {
  return {
    userId: 'user-alice',
    firstName: 'Alice',
    lastName: 'Anderson',
    firstNameKana: 'アリス',
    lastNameKana: 'アンダーソン',
    employeeCode: 'EMP-001',
    phoneNumber: '090-1234-5678',
    avatarUrl: 'https://example.com/alice.png',
    selfIntro: 'Hello, I am Alice.',
    email: 'alice@example.com',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    hireDate: new Date('2025-04-01T00:00:00.000Z'),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeBobProfile(): ProfileRecord {
  return {
    userId: 'user-bob',
    firstName: 'Bob',
    lastName: 'Brown',
    firstNameKana: null,
    lastNameKana: null,
    employeeCode: 'EMP-002',
    phoneNumber: null,
    avatarUrl: null,
    selfIntro: null,
    email: 'bob@example.com',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    role: 'MANAGER',
    status: 'ACTIVE',
    hireDate: new Date('2024-01-15T00:00:00.000Z'),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeViewerRepo(viewers: Record<string, string>): ProfileViewerRepository {
  return {
    async findRoleByUserId(userId: string) {
      const role = viewers[userId]
      return role ? { role } : null
    },
  }
}

interface TestSetup {
  svc: ProfileService
  profiles: ProfileRepository
}

function makeSetup(seed: readonly ProfileRecord[], viewers: Record<string, string>): TestSetup {
  const profiles = createInMemoryProfileRepository(seed)
  const viewerRepo = makeViewerRepo(viewers)
  const svc = createProfileService({ profiles, viewers: viewerRepo })
  return { svc, profiles }
}

// ─────────────────────────────────────────────────────────────────────────────
// getProfile (Req 14.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('ProfileService.getProfile', () => {
  it('自分自身のプロフィールは全項目 (full) で返される', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    const view = await svc.getProfile('user-alice', 'user-alice')

    expect(view.kind).toBe('full')
    expect(view.userId).toBe('user-alice')
    expect(view.firstName).toBe('Alice')
    expect(view.lastName).toBe('Anderson')

    if (view.kind === 'full') {
      expect(view.email).toBe('alice@example.com')
      expect(view.phoneNumber).toBe('090-1234-5678')
      expect(view.employeeCode).toBe('EMP-001')
      expect(view.firstNameKana).toBe('アリス')
      expect(view.locale).toBe('ja-JP')
      expect(view.timezone).toBe('Asia/Tokyo')
      expect(view.role).toBe('EMPLOYEE')
      expect(view.status).toBe('ACTIVE')
      expect(view.hireDate).toEqual(new Date('2025-04-01T00:00:00.000Z'))
    }
  })

  it('ADMIN が他のユーザーのプロフィールを閲覧すると全項目 (full)', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-admin': 'ADMIN' })

    const view = await svc.getProfile('user-admin', 'user-alice')

    expect(view.kind).toBe('full')
    if (view.kind === 'full') {
      expect(view.email).toBe('alice@example.com')
      expect(view.phoneNumber).toBe('090-1234-5678')
      expect(view.employeeCode).toBe('EMP-001')
    }
  })

  it('EMPLOYEE が他のユーザーのプロフィールを閲覧すると基本情報のみ (basic)', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-bob': 'EMPLOYEE' })

    const view = await svc.getProfile('user-bob', 'user-alice')

    expect(view.kind).toBe('basic')
    expect(view.userId).toBe('user-alice')
    expect(view.firstName).toBe('Alice')
    expect(view.lastName).toBe('Anderson')
    expect(view.avatarUrl).toBe('https://example.com/alice.png')
    expect(view.selfIntro).toBe('Hello, I am Alice.')

    // full ビューのフィールドは含まれない
    expect('email' in view).toBe(false)
    expect('phoneNumber' in view).toBe(false)
    expect('employeeCode' in view).toBe(false)
  })

  it('MANAGER が他のユーザーのプロフィールを閲覧すると基本情報のみ (basic)', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-manager': 'MANAGER' })

    const view = await svc.getProfile('user-manager', 'user-alice')

    expect(view.kind).toBe('basic')
  })

  it('HR_MANAGER が他のユーザーのプロフィールを閲覧すると基本情報のみ (basic)', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-hr': 'HR_MANAGER' })

    const view = await svc.getProfile('user-hr', 'user-alice')

    expect(view.kind).toBe('basic')
  })

  it('存在しないユーザーは ProfileNotFoundError', async () => {
    const { svc } = makeSetup([], { 'user-admin': 'ADMIN' })

    await expect(svc.getProfile('user-admin', 'user-unknown')).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    )
  })

  it('avatarUrl が null のプロフィールも正しく返される', async () => {
    const bob = makeBobProfile()
    const { svc } = makeSetup([bob], { 'user-bob': 'MANAGER' })

    const view = await svc.getProfile('user-bob', 'user-bob')

    expect(view.kind).toBe('full')
    if (view.kind === 'full') {
      expect(view.avatarUrl).toBeNull()
      expect(view.selfIntro).toBeNull()
      expect(view.phoneNumber).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// editProfile (Req 14.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('ProfileService.editProfile', () => {
  it('自分のプロフィールの氏名を更新できる', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', { firstName: 'Alicia', lastName: 'Smith' })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.firstName).toBe('Alicia')
    expect(updated?.lastName).toBe('Smith')
  })

  it('自己紹介と avatarUrl を更新できる', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', {
      selfIntro: 'Updated intro',
      avatarUrl: 'https://example.com/new-avatar.png',
    })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.selfIntro).toBe('Updated intro')
    expect(updated?.avatarUrl).toBe('https://example.com/new-avatar.png')
  })

  it('locale と timezone を更新できる', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', {
      locale: 'en-US',
      timezone: 'America/New_York',
    })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.locale).toBe('en-US')
    expect(updated?.timezone).toBe('America/New_York')
  })

  it('phoneNumber を更新できる', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', { phoneNumber: '03-9999-0000' })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.phoneNumber).toBe('03-9999-0000')
  })

  it('フィールドを null に設定できる（クリア）', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', {
      selfIntro: null,
      avatarUrl: null,
      phoneNumber: null,
    })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.selfIntro).toBeNull()
    expect(updated?.avatarUrl).toBeNull()
    expect(updated?.phoneNumber).toBeNull()
  })

  it('存在しないユーザーの編集は ProfileNotFoundError', async () => {
    const { svc } = makeSetup([], { 'user-unknown': 'EMPLOYEE' })

    await expect(svc.editProfile('user-unknown', { firstName: 'New' })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    )
  })

  it('指定しないフィールドは変更されない（部分更新）', async () => {
    const alice = makeAliceProfile()
    const { svc, profiles } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await svc.editProfile('user-alice', { firstName: 'Alicia' })

    const updated = await profiles.findByUserId('user-alice')
    expect(updated?.firstName).toBe('Alicia')
    // 変更していないフィールドは元の値のまま
    expect(updated?.lastName).toBe('Anderson')
    expect(updated?.selfIntro).toBe('Hello, I am Alice.')
    expect(updated?.locale).toBe('ja-JP')
  })

  it('avatarUrl に不正な URL を指定するとバリデーションエラー', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    await expect(svc.editProfile('user-alice', { avatarUrl: 'not-a-url' })).rejects.toThrow()
  })

  it('selfIntro が 500 文字を超えるとバリデーションエラー', async () => {
    const alice = makeAliceProfile()
    const { svc } = makeSetup([alice], { 'user-alice': 'EMPLOYEE' })

    const longText = 'a'.repeat(501)
    await expect(svc.editProfile('user-alice', { selfIntro: longText })).rejects.toThrow()
  })
})
