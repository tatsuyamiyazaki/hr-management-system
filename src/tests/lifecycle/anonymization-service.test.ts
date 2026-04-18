/**
 * Issue #31 / Req 14.7, 14.8: AnonymizationService の単体テスト
 *
 * - anonymizeExpiredRetirees: 7年経過した退職者の一括匿名化
 * - handleDeletionRequest: 削除要求の計画立案・即時実行判定
 * - anonymizeUser: 個別ユーザーの匿名化・監査ログ記録
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAnonymizationService } from '@/lib/lifecycle/anonymization-service'
import type {
  AnonymizationAuditEmitter,
  AnonymizationUserRecord,
  AnonymizationUserRepository,
} from '@/lib/lifecycle/anonymization-service'
import {
  UserAlreadyAnonymizedError,
  UserNotFoundError,
  UserNotResignedError,
  DELETABLE_FIELDS,
  RETENTION_FIELDS,
} from '@/lib/lifecycle/anonymization-types'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-18T10:00:00.000Z')
const SEVEN_YEARS_AGO = new Date('2019-04-17T00:00:00.000Z')
const SIX_YEARS_AGO = new Date('2020-04-17T00:00:00.000Z')

function makeUserRepo(initialUsers: AnonymizationUserRecord[] = []) {
  const users = new Map(initialUsers.map((u) => [u.id, { ...u }]))

  const repo: AnonymizationUserRepository = {
    async findResignedBefore(cutoffDate: Date) {
      return [...users.values()].filter(
        (u) =>
          u.status === 'RESIGNED' &&
          u.anonymizedAt === null &&
          u.resignDate !== null &&
          u.resignDate <= cutoffDate,
      )
    },
    async findById(userId: string) {
      return users.get(userId) ?? null
    },
    async anonymize(userId: string, anonymizedAt: Date) {
      const user = users.get(userId)
      if (user) {
        users.set(userId, { ...user, anonymizedAt })
      }
    },
  }

  return { repo, users }
}

function makeAuditEmitter() {
  const entries: Array<Record<string, unknown>> = []
  const emitter: AnonymizationAuditEmitter = {
    emit: vi.fn().mockImplementation(async (entry) => {
      entries.push(entry as Record<string, unknown>)
    }),
  }
  return { emitter, entries }
}

function makeService(
  users: AnonymizationUserRecord[] = [],
  overrides: { clock?: () => Date; retentionPeriodMs?: number } = {},
) {
  const { repo, users: userMap } = makeUserRepo(users)
  const { emitter, entries } = makeAuditEmitter()
  const svc = createAnonymizationService({
    users: repo,
    auditEmitter: emitter,
    clock: overrides.clock ?? (() => NOW),
    retentionPeriodMs: overrides.retentionPeriodMs,
  })
  return { svc, userMap, emitter, entries }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// anonymizeUser
// ─────────────────────────────────────────────────────────────────────────────

describe('AnonymizationService.anonymizeUser', () => {
  it('退職済みユーザーを匿名化し、監査ログを記録する', async () => {
    const { svc, userMap, emitter } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
    ])

    await svc.anonymizeUser('u1', 'admin-1')

    const updated = userMap.get('u1')
    expect(updated?.anonymizedAt).toEqual(NOW)
    expect(emitter.emit).toHaveBeenCalledTimes(1)
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'RECORD_UPDATE',
        resourceType: 'USER',
        resourceId: 'u1',
      }),
    )
  })

  it('存在しないユーザーは UserNotFoundError', async () => {
    const { svc } = makeService([])

    await expect(svc.anonymizeUser('nonexistent', 'admin-1')).rejects.toBeInstanceOf(
      UserNotFoundError,
    )
  })

  it('退職状態でないユーザーは UserNotResignedError', async () => {
    const { svc } = makeService([
      { id: 'u1', status: 'ACTIVE', resignDate: null, anonymizedAt: null },
    ])

    await expect(svc.anonymizeUser('u1', 'admin-1')).rejects.toBeInstanceOf(UserNotResignedError)
  })

  it('既に匿名化済みのユーザーは UserAlreadyAnonymizedError', async () => {
    const { svc } = makeService([
      {
        id: 'u1',
        status: 'RESIGNED',
        resignDate: SEVEN_YEARS_AGO,
        anonymizedAt: new Date('2025-01-01'),
      },
    ])

    await expect(svc.anonymizeUser('u1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyAnonymizedError,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// anonymizeExpiredRetirees
// ─────────────────────────────────────────────────────────────────────────────

describe('AnonymizationService.anonymizeExpiredRetirees', () => {
  it('7年経過した退職者を一括匿名化する', async () => {
    const { svc, userMap } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
      { id: 'u2', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
    ])

    const result = await svc.anonymizeExpiredRetirees()

    expect(result.processedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
    expect(result.errors).toEqual([])
    expect(userMap.get('u1')?.anonymizedAt).toEqual(NOW)
    expect(userMap.get('u2')?.anonymizedAt).toEqual(NOW)
  })

  it('7年未経過の退職者はスキップされる', async () => {
    const { svc, userMap } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SIX_YEARS_AGO, anonymizedAt: null },
    ])

    const result = await svc.anonymizeExpiredRetirees()

    expect(result.processedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.errors).toEqual([])
    expect(userMap.get('u1')?.anonymizedAt).toBeNull()
  })

  it('既に匿名化済みのユーザーはスキップされる', async () => {
    const existingDate = new Date('2025-01-01')
    const { svc } = makeService([
      {
        id: 'u1',
        status: 'RESIGNED',
        resignDate: SEVEN_YEARS_AGO,
        anonymizedAt: existingDate,
      },
    ])

    const result = await svc.anonymizeExpiredRetirees()

    expect(result.processedCount).toBe(0)
    // findResignedBefore already filters out anonymized, so skippedCount = 0
    expect(result.errors).toEqual([])
  })

  it('候補がいない場合は空のサマリーを返す', async () => {
    const { svc } = makeService([])

    const result = await svc.anonymizeExpiredRetirees()

    expect(result.processedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('一部のユーザーでエラーが発生しても他のユーザーは処理される', async () => {
    const { repo: userRepo } = makeUserRepo([
      { id: 'u1', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
      { id: 'u2', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
    ])
    const { emitter } = makeAuditEmitter()

    // u1 の anonymize を失敗させる
    const originalAnonymize = userRepo.anonymize.bind(userRepo)
    let callCount = 0
    userRepo.anonymize = async (userId: string, anonymizedAt: Date) => {
      callCount++
      if (callCount === 1) {
        throw new Error('DB connection lost')
      }
      return originalAnonymize(userId, anonymizedAt)
    }

    const svc = createAnonymizationService({
      users: userRepo,
      auditEmitter: emitter,
      clock: () => NOW,
    })

    const result = await svc.anonymizeExpiredRetirees()

    expect(result.processedCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.reason).toContain('DB connection lost')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// handleDeletionRequest
// ─────────────────────────────────────────────────────────────────────────────

describe('AnonymizationService.handleDeletionRequest', () => {
  it('7年経過済みの退職者は即時削除可能な計画を返し匿名化を実行する', async () => {
    const { svc, userMap } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SEVEN_YEARS_AGO, anonymizedAt: null },
    ])

    const plan = await svc.handleDeletionRequest('u1', 'admin-1')

    expect(plan.userId).toBe('u1')
    expect(plan.requestedBy).toBe('admin-1')
    expect(plan.canExecuteImmediately).toBe(true)
    expect(plan.executedAt).toEqual(NOW)
    expect(plan.deletableFields).toEqual([...DELETABLE_FIELDS])
    expect(plan.retentionFields).toEqual([...RETENTION_FIELDS])
    expect(userMap.get('u1')?.anonymizedAt).toEqual(NOW)
  })

  it('7年未経過の退職者は即時削除不可の計画を返す（匿名化は実行しない）', async () => {
    const { svc, userMap } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SIX_YEARS_AGO, anonymizedAt: null },
    ])

    const plan = await svc.handleDeletionRequest('u1', 'admin-1')

    expect(plan.canExecuteImmediately).toBe(false)
    expect(plan.executedAt).toBeNull()
    expect(plan.deletableFields).toEqual([...DELETABLE_FIELDS])
    expect(plan.retentionFields).toEqual([...RETENTION_FIELDS])
    expect(userMap.get('u1')?.anonymizedAt).toBeNull()
  })

  it('存在しないユーザーは UserNotFoundError', async () => {
    const { svc } = makeService([])

    await expect(svc.handleDeletionRequest('nonexistent', 'admin-1')).rejects.toBeInstanceOf(
      UserNotFoundError,
    )
  })

  it('退職状態でないユーザーは UserNotResignedError', async () => {
    const { svc } = makeService([
      { id: 'u1', status: 'ACTIVE', resignDate: null, anonymizedAt: null },
    ])

    await expect(svc.handleDeletionRequest('u1', 'admin-1')).rejects.toBeInstanceOf(
      UserNotResignedError,
    )
  })

  it('既に匿名化済みのユーザーは UserAlreadyAnonymizedError', async () => {
    const { svc } = makeService([
      {
        id: 'u1',
        status: 'RESIGNED',
        resignDate: SEVEN_YEARS_AGO,
        anonymizedAt: new Date('2025-01-01'),
      },
    ])

    await expect(svc.handleDeletionRequest('u1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyAnonymizedError,
    )
  })

  it('削除計画に deletableFields と retentionFields が正しく含まれる', async () => {
    const { svc } = makeService([
      { id: 'u1', status: 'RESIGNED', resignDate: SIX_YEARS_AGO, anonymizedAt: null },
    ])

    const plan = await svc.handleDeletionRequest('u1', 'representative-1')

    // PII 項目が削除可能
    expect(plan.deletableFields).toContain('email')
    expect(plan.deletableFields).toContain('firstName')
    expect(plan.deletableFields).toContain('lastName')
    expect(plan.deletableFields).toContain('phoneNumber')

    // 法定保持項目が含まれる
    expect(plan.retentionFields).toContain('userId')
    expect(plan.retentionFields).toContain('hireDate')
    expect(plan.retentionFields).toContain('resignDate')
  })
})
