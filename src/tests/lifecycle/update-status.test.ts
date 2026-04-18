/**
 * Issue #29 / Req 14.2, 14.3, 14.4: LifecycleService.updateStatus の単体テスト
 *
 * - ステータス遷移の正常系: ACTIVE → ON_LEAVE, ACTIVE → RESIGNED,
 *   PENDING_JOIN → ACTIVE, ON_LEAVE → ACTIVE, ON_LEAVE → RESIGNED
 * - 遷移禁止: RESIGNED → *, 同一ステータス, PENDING_JOIN → ON_LEAVE 等
 * - 評価自動除外: ON_LEAVE / RESIGNED 時に EvaluationExclusionPort.excludeFromActiveEvaluations 呼出
 * - ユーザー未存在: EmployeeNotFoundError
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInvitationService } from '@/lib/auth/invitation-service'
import { createInMemoryInvitationTokenRepository } from '@/lib/auth/invitation-token-repository'
import { createInMemoryAuthUserRepository } from '@/lib/auth/user-repository'
import type { PasswordHasher } from '@/lib/auth/password-hasher'
import type { InvitationEmailSender } from '@/lib/auth/invitation-service'
import { createLifecycleService } from '@/lib/lifecycle/lifecycle-service'
import type {
  EmployeeProfileRepository,
  EvaluationExclusionPort,
} from '@/lib/lifecycle/lifecycle-service'
import {
  EmployeeNotFoundError,
  InvalidStatusTransitionError,
} from '@/lib/lifecycle/lifecycle-types'

const APP_SECRET = 'test-secret-32-chars-long-enough!!'

function makeHasher(): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    verify: vi.fn().mockResolvedValue(false),
  }
}

function makeEmailSender(): InvitationEmailSender {
  return { sendInvitationEmail: vi.fn().mockResolvedValue(undefined) }
}

function makeProfileRepo(): EmployeeProfileRepository {
  return { saveProfile: vi.fn().mockResolvedValue(undefined) }
}

function makeEvaluationExclusion(): EvaluationExclusionPort {
  return { excludeFromActiveEvaluations: vi.fn().mockResolvedValue(0) }
}

function makeSetup(evaluationExclusion?: EvaluationExclusionPort) {
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
  const profiles = makeProfileRepo()
  const svc = createLifecycleService({
    invitations,
    users,
    profiles,
    evaluationExclusion,
    appSecret: APP_SECRET,
    jobIdFactory: () => 'job-test',
  })
  return { svc, users }
}

/** 社員を ACTIVE 状態にするヘルパー */
async function createActiveEmployee(
  setup: ReturnType<typeof makeSetup>,
  email = 'alice@example.com',
) {
  const employee = await setup.svc.createEmployee(
    {
      email,
      firstName: 'Alice',
      lastName: 'Anderson',
      role: 'EMPLOYEE',
      hireDate: new Date('2026-04-01T00:00:00.000Z'),
      departmentId: 'dept-001',
      positionId: 'pos-001',
    },
    'admin-1',
  )
  // PENDING_JOIN → ACTIVE にする
  await setup.svc.updateStatus(employee.id, {
    newStatus: 'ACTIVE',
    effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
  })
  return employee
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// ステータス遷移の正常系
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.updateStatus - 正常なステータス遷移', () => {
  it('PENDING_JOIN → ACTIVE（入社）', async () => {
    const setup = makeSetup()
    const employee = await setup.svc.createEmployee(
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

    // 初期状態: PENDING_JOIN
    const before = await setup.users.findById(employee.id)
    expect(before?.status).toBe('PENDING_JOIN')

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ACTIVE',
      effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('ACTIVE')
  })

  it('ACTIVE → ON_LEAVE（休職）', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ON_LEAVE',
      effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('ON_LEAVE')
  })

  it('ACTIVE → RESIGNED（退職）', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'RESIGNED',
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('RESIGNED')
  })

  it('ON_LEAVE → ACTIVE（復職）', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    // ACTIVE → ON_LEAVE
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ON_LEAVE',
      effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    })

    // ON_LEAVE → ACTIVE
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ACTIVE',
      effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('ACTIVE')
  })

  it('ON_LEAVE → RESIGNED（休職中退職）', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    // ACTIVE → ON_LEAVE
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ON_LEAVE',
      effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    })

    // ON_LEAVE → RESIGNED
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'RESIGNED',
      effectiveDate: new Date('2026-08-31T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('RESIGNED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ステータス遷移の異常系
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.updateStatus - 不正なステータス遷移', () => {
  it('RESIGNED → ACTIVE は InvalidStatusTransitionError', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'RESIGNED',
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
    })

    await expect(
      setup.svc.updateStatus(employee.id, {
        newStatus: 'ACTIVE',
        effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError)
  })

  it('PENDING_JOIN → ON_LEAVE は InvalidStatusTransitionError', async () => {
    const setup = makeSetup()
    const employee = await setup.svc.createEmployee(
      {
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Brown',
        role: 'EMPLOYEE',
        hireDate: new Date('2026-04-01T00:00:00.000Z'),
        departmentId: 'dept-001',
        positionId: 'pos-001',
      },
      'admin-1',
    )

    await expect(
      setup.svc.updateStatus(employee.id, {
        newStatus: 'ON_LEAVE',
        effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError)
  })

  it('PENDING_JOIN → RESIGNED は InvalidStatusTransitionError', async () => {
    const setup = makeSetup()
    const employee = await setup.svc.createEmployee(
      {
        email: 'carol@example.com',
        firstName: 'Carol',
        lastName: 'Chen',
        role: 'EMPLOYEE',
        hireDate: new Date('2026-04-01T00:00:00.000Z'),
        departmentId: 'dept-001',
        positionId: 'pos-001',
      },
      'admin-1',
    )

    await expect(
      setup.svc.updateStatus(employee.id, {
        newStatus: 'RESIGNED',
        effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError)
  })

  it('同一ステータスへの遷移は InvalidStatusTransitionError', async () => {
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    await expect(
      setup.svc.updateStatus(employee.id, {
        newStatus: 'ACTIVE',
        effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ユーザー未存在
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.updateStatus - ユーザー未存在', () => {
  it('存在しない userId は EmployeeNotFoundError', async () => {
    const setup = makeSetup()

    await expect(
      setup.svc.updateStatus('non-existent', {
        newStatus: 'ACTIVE',
        effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 評価自動除外 (Req 14.3, 14.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('LifecycleService.updateStatus - 評価自動除外', () => {
  it('ON_LEAVE 遷移時に excludeFromActiveEvaluations が呼ばれる', async () => {
    const exclusion = makeEvaluationExclusion()
    const setup = makeSetup(exclusion)
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ON_LEAVE',
      effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(exclusion.excludeFromActiveEvaluations).toHaveBeenCalledWith(employee.id)
    expect(exclusion.excludeFromActiveEvaluations).toHaveBeenCalledTimes(1)
  })

  it('RESIGNED 遷移時に excludeFromActiveEvaluations が呼ばれる', async () => {
    const exclusion = makeEvaluationExclusion()
    const setup = makeSetup(exclusion)
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'RESIGNED',
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
    })

    expect(exclusion.excludeFromActiveEvaluations).toHaveBeenCalledWith(employee.id)
    expect(exclusion.excludeFromActiveEvaluations).toHaveBeenCalledTimes(1)
  })

  it('ACTIVE 遷移時は excludeFromActiveEvaluations は呼ばれない', async () => {
    const exclusion = makeEvaluationExclusion()
    const setup = makeSetup(exclusion)
    const employee = await setup.svc.createEmployee(
      {
        email: 'dave@example.com',
        firstName: 'Dave',
        lastName: 'Davis',
        role: 'EMPLOYEE',
        hireDate: new Date('2026-04-01T00:00:00.000Z'),
        departmentId: 'dept-001',
        positionId: 'pos-001',
      },
      'admin-1',
    )

    // PENDING_JOIN → ACTIVE: exclude は呼ばれない
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ACTIVE',
      effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
    })

    expect(exclusion.excludeFromActiveEvaluations).not.toHaveBeenCalled()
  })

  it('EvaluationExclusionPort 未設定でも ON_LEAVE 遷移は正常に完了する', async () => {
    // evaluationExclusion なし
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    // エラーなく完了する
    await setup.svc.updateStatus(employee.id, {
      newStatus: 'ON_LEAVE',
      effectiveDate: new Date('2026-05-01T00:00:00.000Z'),
    })

    const after = await setup.users.findById(employee.id)
    expect(after?.status).toBe('ON_LEAVE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ログイン拒否 (Req 14.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Req 14.4: 退職者のログイン拒否', () => {
  it('RESIGNED ステータスのユーザーは AuthService.login で拒否される', async () => {
    // AuthService 側の user.status !== 'ACTIVE' チェックにより
    // RESIGNED 状態のユーザーはログインできない。
    // この動作は auth-service.test.ts でカバーされているが、
    // ここでは updateStatus → status=RESIGNED の流れを確認する。
    const setup = makeSetup()
    const employee = await createActiveEmployee(setup)

    await setup.svc.updateStatus(employee.id, {
      newStatus: 'RESIGNED',
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
    })

    const user = await setup.users.findById(employee.id)
    expect(user?.status).toBe('RESIGNED')
    // AuthService.login は user.status !== 'ACTIVE' の場合に
    // InvalidCredentialsError をスローする（auth-service.ts:148）
  })
})
