/**
 * Issue #29 / Req 14.1, 14.9: LifecycleService の単体テスト
 *
 * - createEmployee: InvitationService.inviteUser が呼ばれる / Profile 保存
 * - bulkImportUsers: 全行成功 / 一部失敗（エラー集約）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInvitationService } from '@/lib/auth/invitation-service'
import { createInMemoryInvitationTokenRepository } from '@/lib/auth/invitation-token-repository'
import { createInMemoryAuthUserRepository } from '@/lib/auth/user-repository'
import type { PasswordHasher } from '@/lib/auth/password-hasher'
import type { InvitationEmailSender } from '@/lib/auth/invitation-service'
import type { InvitationService } from '@/lib/auth/invitation-service'
import { EmailAlreadyExistsError } from '@/lib/auth/invitation-types'
import { createLifecycleService } from '@/lib/lifecycle/lifecycle-service'
import type { EmployeeProfileRepository } from '@/lib/lifecycle/lifecycle-service'
import { EmployeeAlreadyExistsError } from '@/lib/lifecycle/lifecycle-types'

const APP_SECRET = 'test-secret-32-chars-long-enough!!'
const HEADER = 'email,firstName,lastName,role,hireDate,departmentId,positionId'

function makeHasher(): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    verify: vi.fn().mockResolvedValue(false),
  }
}

function makeEmailSender(): InvitationEmailSender {
  return { sendInvitationEmail: vi.fn().mockResolvedValue(undefined) }
}

function makeProfileRepo() {
  const saved: Array<{
    userId: string
    firstName: string
    lastName: string
    hireDate: Date
    departmentId: string
    positionId: string
  }> = []
  const repo: EmployeeProfileRepository = {
    async saveProfile(profile) {
      saved.push({ ...profile })
    },
  }
  return { repo, saved }
}

function makeRealSetup(jobId = 'job-abc') {
  const tokens = createInMemoryInvitationTokenRepository()
  const users = createInMemoryAuthUserRepository()
  const hasher = makeHasher()
  const emailSender = makeEmailSender()
  let userCounter = 0
  const invitations = createInvitationService({
    tokens,
    users,
    passwordHasher: hasher,
    emailSender,
    appSecret: APP_SECRET,
    userIdFactory: () => `user-${++userCounter}`,
    tokenFactory: () => `token-${userCounter}`,
    clock: () => new Date('2026-04-18T10:00:00.000Z'),
  })
  const { repo: profiles, saved } = makeProfileRepo()
  const svc = createLifecycleService({
    invitations,
    users,
    profiles,
    appSecret: APP_SECRET,
    jobIdFactory: () => jobId,
  })
  return { svc, users, invitations, emailSender, saved }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// createEmployee
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.createEmployee', () => {
  it('InvitationService.inviteUser が呼ばれて PENDING_JOIN ユーザーが作成される', async () => {
    const { svc, users, emailSender } = makeRealSetup()

    const employee = await svc.createEmployee(
      {
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Anderson',
        role: 'EMPLOYEE',
        hireDate: new Date('2026-04-01T00:00:00.000Z'),
        departmentId: 'dept-001',
        positionId: 'pos-001',
      },
      'admin-1',
    )

    // 招待メール送信
    expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com', role: 'EMPLOYEE' }),
    )

    // PENDING_JOIN ユーザーが作成されている
    const user = await users.findById(employee.id)
    expect(user?.status).toBe('PENDING_JOIN')
    expect(user?.role).toBe('EMPLOYEE')

    // 返却値の検証
    expect(employee.email).toBe('alice@example.com')
    expect(employee.firstName).toBe('Alice')
    expect(employee.departmentId).toBe('dept-001')
  })

  it('プロフィール（hireDate / departmentId / positionId）が保存される', async () => {
    const { svc, saved } = makeRealSetup()

    await svc.createEmployee(
      {
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Brown',
        role: 'MANAGER',
        hireDate: new Date('2025-10-15T00:00:00.000Z'),
        departmentId: 'dept-002',
        positionId: 'pos-002',
      },
      'admin-1',
    )

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      firstName: 'Bob',
      lastName: 'Brown',
      departmentId: 'dept-002',
      positionId: 'pos-002',
    })
    expect(saved[0]?.hireDate.toISOString()).toBe('2025-10-15T00:00:00.000Z')
  })

  it('重複 email は EmployeeAlreadyExistsError', async () => {
    const { svc } = makeRealSetup()

    const input = {
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Anderson',
      role: 'EMPLOYEE' as const,
      hireDate: new Date('2026-04-01T00:00:00.000Z'),
      departmentId: 'dept-001',
      positionId: 'pos-001',
    }
    await svc.createEmployee(input, 'admin-1')

    await expect(svc.createEmployee(input, 'admin-1')).rejects.toBeInstanceOf(
      EmployeeAlreadyExistsError,
    )
  })

  it('InvitationService が他のエラーを投げた場合はそのまま伝播する', async () => {
    const mockInvitations: InvitationService = {
      inviteUser: vi.fn().mockRejectedValue(new Error('network down')),
      acceptInvitation: vi.fn(),
    }
    const users = createInMemoryAuthUserRepository()
    const { repo: profiles } = makeProfileRepo()
    const svc = createLifecycleService({
      invitations: mockInvitations,
      users,
      profiles,
      appSecret: APP_SECRET,
    })

    await expect(
      svc.createEmployee(
        {
          email: 'x@example.com',
          firstName: 'X',
          lastName: 'Y',
          role: 'EMPLOYEE',
          hireDate: new Date('2026-04-01T00:00:00.000Z'),
          departmentId: 'd',
          positionId: 'p',
        },
        'admin-1',
      ),
    ).rejects.toThrow('network down')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// bulkImportUsers
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.bulkImportUsers', () => {
  it('全行成功: 3 行すべて成功', async () => {
    const { svc } = makeRealSetup('job-success')
    const csv =
      `${HEADER}\n` +
      'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
      'bob@example.com,Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n' +
      'carol@example.com,Carol,Chen,HR_MANAGER,2024-06-30,dept-003,pos-003\n'

    const result = await svc.bulkImportUsers(Buffer.from(csv, 'utf-8'), 'admin-1')

    expect(result.totalRows).toBe(3)
    expect(result.successCount).toBe(3)
    expect(result.failureCount).toBe(0)
    expect(result.errors).toEqual([])
    expect(result.jobId).toBe('job-success')
  })

  it('一部失敗: バリデーションエラー行が集約される', async () => {
    const { svc } = makeRealSetup()
    const csv =
      `${HEADER}\n` +
      'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
      'not-an-email,Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n' +
      'carol@example.com,Carol,Chen,UNKNOWN_ROLE,2024-06-30,dept-003,pos-003\n' +
      'dave@example.com,Dave,Davis,EMPLOYEE,not-a-date,dept-004,pos-004\n'

    const result = await svc.bulkImportUsers(Buffer.from(csv, 'utf-8'), 'admin-1')

    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBeGreaterThanOrEqual(3)
    expect(result.totalRows).toBe(result.successCount + result.failureCount)
    expect(result.errors.some((e) => e.field === 'email')).toBe(true)
    expect(result.errors.some((e) => e.field === 'role')).toBe(true)
    expect(result.errors.some((e) => e.field === 'hireDate')).toBe(true)
  })

  it('重複 email の 2 件目以降は失敗として集約される', async () => {
    const { svc } = makeRealSetup()
    const csv =
      `${HEADER}\n` +
      'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
      'alice@example.com,Alice2,Anderson2,EMPLOYEE,2026-05-01,dept-002,pos-002\n'

    const result = await svc.bulkImportUsers(Buffer.from(csv, 'utf-8'), 'admin-1')

    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
    expect(result.totalRows).toBe(2)
  })

  it('DB 重複 (InvitationService が EmailAlreadyExistsError) はエラー集約', async () => {
    const mockInvitations: InvitationService = {
      inviteUser: vi.fn().mockRejectedValue(new EmailAlreadyExistsError()),
      acceptInvitation: vi.fn(),
    }
    const users = createInMemoryAuthUserRepository()
    const { repo: profiles } = makeProfileRepo()
    const svc = createLifecycleService({
      invitations: mockInvitations,
      users,
      profiles,
      appSecret: APP_SECRET,
      jobIdFactory: () => 'job-dup',
    })

    const csv =
      `${HEADER}\n` + 'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n'

    const result = await svc.bulkImportUsers(Buffer.from(csv, 'utf-8'), 'admin-1')
    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(1)
    expect(result.errors[0]?.field).toBe('email')
    expect(result.errors[0]?.message).toContain('既に登録済み')
  })

  it('ヘッダー不正は errors にヘッダーエラー 1 件だけ返り successCount=0', async () => {
    const { svc } = makeRealSetup()
    const result = await svc.bulkImportUsers(
      Buffer.from('foo,bar,baz\nx,y,z\n', 'utf-8'),
      'admin-1',
    )
    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(1)
    expect(result.totalRows).toBe(1)
  })

  it('常に totalRows = successCount + failureCount を満たす', async () => {
    const { svc } = makeRealSetup()
    const csv =
      `${HEADER}\n` +
      'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
      ',Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n'
    const result = await svc.bulkImportUsers(Buffer.from(csv, 'utf-8'), 'admin-1')
    expect(result.totalRows).toBe(result.successCount + result.failureCount)
  })
})
