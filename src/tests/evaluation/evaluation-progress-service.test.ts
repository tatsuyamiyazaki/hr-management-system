/**
 * Issue #55 / Task 15.6: EvaluationProgressService 単体テスト
 * (Req 8.8, 8.9)
 *
 * テスト対象:
 * - getCycleProgress: HR向け全体進捗の集計
 * - getEvaluatorProgress: 個人進捗の取得
 * - scanAndSendReminders: 締切3日前の未提出者への通知
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvaluationProgressService } from '@/lib/evaluation/evaluation-progress-service'
import { EvaluationProgressCycleNotFoundError } from '@/lib/evaluation/evaluation-progress-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(opts: {
  cycle?: { id: string } | null
  assignments?: { evaluatorId: string; targetUserId: string }[]
  submitted?: { evaluatorId: string; targetUserId: string }[]
  activeCycles?: { id: string; name: string }[]
}) {
  const { cycle = { id: 'cycle-1' }, assignments = [], submitted = [], activeCycles = [] } = opts

  return {
    reviewCycle: {
      findUnique: vi.fn().mockResolvedValue(cycle),
      findMany: vi.fn().mockResolvedValue(activeCycles),
    },
    reviewAssignment: {
      findMany: vi.fn().mockResolvedValue(assignments),
    },
    evaluationResponse: {
      findMany: vi.fn().mockResolvedValue(submitted),
    },
  }
}

function makeEmitter() {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

// ─────────────────────────────────────────────────────────────────────────────
// getCycleProgress
// ─────────────────────────────────────────────────────────────────────────────

describe('EvaluationProgressService.getCycleProgress', () => {
  it('サイクルが存在しない場合に EvaluationProgressCycleNotFoundError をスローする', async () => {
    const db = makePrisma({ cycle: null })
    const svc = createEvaluationProgressService(db as never)
    await expect(svc.getCycleProgress('no-such')).rejects.toBeInstanceOf(
      EvaluationProgressCycleNotFoundError,
    )
  })

  it('割り当てが0件の場合は evaluators が空配列を返す', async () => {
    const db = makePrisma({ assignments: [], submitted: [] })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.getCycleProgress('cycle-1')
    expect(result).toEqual({
      cycleId: 'cycle-1',
      totalEvaluators: 0,
      fullySubmittedCount: 0,
      evaluators: [],
    })
  })

  it('全員提出済みの場合 fullySubmittedCount が totalEvaluators と一致する', async () => {
    const db = makePrisma({
      assignments: [
        { evaluatorId: 'u1', targetUserId: 't1' },
        { evaluatorId: 'u2', targetUserId: 't2' },
      ],
      submitted: [
        { evaluatorId: 'u1', targetUserId: 't1' },
        { evaluatorId: 'u2', targetUserId: 't2' },
      ],
    })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.getCycleProgress('cycle-1')
    expect(result.totalEvaluators).toBe(2)
    expect(result.fullySubmittedCount).toBe(2)
    expect(result.evaluators.every((e) => e.pendingCount === 0)).toBe(true)
  })

  it('一部未提出の場合に pendingCount が正しく計算される', async () => {
    const db = makePrisma({
      assignments: [
        { evaluatorId: 'u1', targetUserId: 't1' },
        { evaluatorId: 'u1', targetUserId: 't2' },
      ],
      submitted: [{ evaluatorId: 'u1', targetUserId: 't1' }],
    })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.getCycleProgress('cycle-1')
    expect(result.totalEvaluators).toBe(1)
    expect(result.fullySubmittedCount).toBe(0)
    const u1 = result.evaluators.find((e) => e.evaluatorId === 'u1')
    expect(u1?.submittedCount).toBe(1)
    expect(u1?.pendingCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getEvaluatorProgress
// ─────────────────────────────────────────────────────────────────────────────

describe('EvaluationProgressService.getEvaluatorProgress', () => {
  it('サイクルが存在しない場合に EvaluationProgressCycleNotFoundError をスローする', async () => {
    const db = makePrisma({ cycle: null })
    const svc = createEvaluationProgressService(db as never)
    await expect(svc.getEvaluatorProgress('no-such', 'u1')).rejects.toBeInstanceOf(
      EvaluationProgressCycleNotFoundError,
    )
  })

  it('割り当てが0件の場合は全カウントが0', async () => {
    const db = makePrisma({ assignments: [], submitted: [] })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.getEvaluatorProgress('cycle-1', 'u1')
    expect(result).toEqual({
      evaluatorId: 'u1',
      totalAssignments: 0,
      submittedCount: 0,
      pendingCount: 0,
    })
  })

  it('提出済みと未提出を正しくカウントする', async () => {
    const db = makePrisma({
      assignments: [{ targetUserId: 't1' }, { targetUserId: 't2' }] as never,
      submitted: [{ evaluatorId: 'u1', targetUserId: 't1' }],
    })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.getEvaluatorProgress('cycle-1', 'u1')
    expect(result.totalAssignments).toBe(2)
    expect(result.submittedCount).toBe(1)
    expect(result.pendingCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// scanAndSendReminders
// ─────────────────────────────────────────────────────────────────────────────

describe('EvaluationProgressService.scanAndSendReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('対象サイクルがない場合は notified=0, skipped=0 を返す', async () => {
    const db = makePrisma({ activeCycles: [] })
    const svc = createEvaluationProgressService(db as never)
    const result = await svc.scanAndSendReminders(new Date('2026-04-20T00:00:00Z'))
    expect(result).toEqual({ notified: 0, skipped: 0 })
  })

  it('未提出の評価者に通知を送り notified をカウントする', async () => {
    const emitter = makeEmitter()
    const db = {
      reviewCycle: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cycle-1' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'cycle-1', name: 'テストサイクル' }]),
      },
      reviewAssignment: {
        findMany: vi.fn().mockResolvedValue([
          { evaluatorId: 'u1', targetUserId: 't1' },
          { evaluatorId: 'u2', targetUserId: 't2' },
        ]),
      },
      evaluationResponse: {
        findMany: vi.fn().mockResolvedValue([{ evaluatorId: 'u1', targetUserId: 't1' }]),
      },
    }
    const svc = createEvaluationProgressService(db as never, emitter as never)
    const result = await svc.scanAndSendReminders(new Date('2026-04-20T00:00:00Z'))
    expect(result.notified).toBe(1)
    expect(result.skipped).toBe(0)
    expect(emitter.emit).toHaveBeenCalledTimes(1)
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', category: 'EVAL_REMINDER' }),
    )
  })

  it('notificationEmitter が null の場合は skipped をカウントする', async () => {
    const db = {
      reviewCycle: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cycle-1' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'cycle-1', name: 'テストサイクル' }]),
      },
      reviewAssignment: {
        findMany: vi.fn().mockResolvedValue([{ evaluatorId: 'u1', targetUserId: 't1' }]),
      },
      evaluationResponse: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const svc = createEvaluationProgressService(db as never, null)
    const result = await svc.scanAndSendReminders(new Date('2026-04-20T00:00:00Z'))
    expect(result.notified).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('全員提出済みの場合は notified=0 を返す', async () => {
    const emitter = makeEmitter()
    const db = {
      reviewCycle: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cycle-1' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'cycle-1', name: 'テストサイクル' }]),
      },
      reviewAssignment: {
        findMany: vi.fn().mockResolvedValue([{ evaluatorId: 'u1', targetUserId: 't1' }]),
      },
      evaluationResponse: {
        findMany: vi.fn().mockResolvedValue([{ evaluatorId: 'u1', targetUserId: 't1' }]),
      },
    }
    const svc = createEvaluationProgressService(db as never, emitter as never)
    const result = await svc.scanAndSendReminders(new Date('2026-04-20T00:00:00Z'))
    expect(result.notified).toBe(0)
    expect(result.skipped).toBe(0)
    expect(emitter.emit).not.toHaveBeenCalled()
  })
})
