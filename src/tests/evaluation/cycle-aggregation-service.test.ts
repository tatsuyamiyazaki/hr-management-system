/**
 * Issue #56 / Task 15.7: CycleAggregationService 単体テスト
 * (Req 8.13, 8.14, 8.15, 8.18, 8.19)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCycleAggregationService } from '@/lib/evaluation/cycle-aggregation-service'
import {
  CycleAggregationNotFoundError,
  CycleAggregationInvalidStatusError,
} from '@/lib/evaluation/cycle-aggregation-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CYCLE = {
  id: 'cycle-1',
  status: 'AGGREGATING',
  minReviewers: 3,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-03-31T00:00:00Z'),
}

function makePrisma(opts: {
  cycle?: object | null
  responses?: object[]
  assignments?: object[]
  users?: object[]
  transactionFn?: () => Promise<object[]>
}) {
  const {
    cycle = BASE_CYCLE,
    responses = [],
    assignments = [],
    users = [],
    transactionFn = async () => [],
  } = opts

  return {
    reviewCycle: { findUnique: vi.fn().mockResolvedValue(cycle) },
    evaluationResponse: { findMany: vi.fn().mockResolvedValue(responses) },
    reviewAssignment: { findMany: vi.fn().mockResolvedValue(assignments) },
    user: { findMany: vi.fn().mockResolvedValue(users) },
    $transaction: vi.fn().mockImplementation(transactionFn),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateCycle (Req 8.13, 8.14, 8.15)
// ─────────────────────────────────────────────────────────────────────────────

describe('CycleAggregationService.aggregateCycle', () => {
  it('サイクルが存在しない場合 CycleAggregationNotFoundError をスローする', async () => {
    const db = makePrisma({ cycle: null })
    const svc = createCycleAggregationService(db as never)
    await expect(svc.aggregateCycle('no-such')).rejects.toBeInstanceOf(
      CycleAggregationNotFoundError,
    )
  })

  it('DRAFT ステータスでは CycleAggregationInvalidStatusError をスローする', async () => {
    const db = makePrisma({ cycle: { ...BASE_CYCLE, status: 'DRAFT' } })
    const svc = createCycleAggregationService(db as never)
    await expect(svc.aggregateCycle('cycle-1')).rejects.toBeInstanceOf(
      CycleAggregationInvalidStatusError,
    )
  })

  it('回答が0件の場合は空の results を返す', async () => {
    const db = makePrisma({ responses: [] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.aggregateCycle('cycle-1')
    expect(result.totalTargets).toBe(0)
    expect(result.results).toEqual([])
  })

  it('peerScore = Σpeer_scores / peer_count で計算される (Req 8.13)', async () => {
    const db = makePrisma({
      responses: [
        { targetUserId: 't1', responseType: 'PEER', score: 80, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 60, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 70, comment: null },
      ],
    })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.aggregateCycle('cycle-1')
    const t1 = result.results.find((r) => r.targetUserId === 't1')
    expect(t1?.peerScore).toBeCloseTo((80 + 60 + 70) / 3)
    expect(t1?.peerEvaluatorCount).toBe(3)
  })

  it('peerEvaluatorCount < minReviewers のとき minimumNotMet = true (Req 8.14)', async () => {
    const db = makePrisma({
      responses: [
        { targetUserId: 't1', responseType: 'PEER', score: 80, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 70, comment: null },
      ],
    })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.aggregateCycle('cycle-1')
    const t1 = result.results.find((r) => r.targetUserId === 't1')
    expect(t1?.minimumNotMet).toBe(true)
    expect(result.minimumNotMetCount).toBe(1)
  })

  it('peerEvaluatorCount >= minReviewers のとき minimumNotMet = false', async () => {
    const db = makePrisma({
      responses: [
        { targetUserId: 't1', responseType: 'PEER', score: 80, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 70, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 90, comment: null },
      ],
    })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.aggregateCycle('cycle-1')
    const t1 = result.results.find((r) => r.targetUserId === 't1')
    expect(t1?.minimumNotMet).toBe(false)
  })

  it('自己評価・上司評価スコアと匿名コメントを正しく集計する (Req 8.15)', async () => {
    const db = makePrisma({
      responses: [
        { targetUserId: 't1', responseType: 'SELF', score: 80, comment: '自己コメント' },
        { targetUserId: 't1', responseType: 'TOP_DOWN', score: 75, comment: 'good' },
        { targetUserId: 't1', responseType: 'PEER', score: 85, comment: 'great' },
        { targetUserId: 't1', responseType: 'PEER', score: 90, comment: null },
        { targetUserId: 't1', responseType: 'PEER', score: 70, comment: 'ok' },
      ],
    })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.aggregateCycle('cycle-1')
    const t1 = result.results.find((r) => r.targetUserId === 't1')
    expect(t1?.selfScore).toBe(80)
    expect(t1?.topDownScore).toBe(75)
    expect(t1?.anonymousComments).toContain('good')
    expect(t1?.anonymousComments).toContain('great')
    expect(t1?.anonymousComments).toContain('ok')
    expect(t1?.anonymousComments).not.toContain('自己コメント')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkEligibility (Req 8.18)
// ─────────────────────────────────────────────────────────────────────────────

describe('CycleAggregationService.checkEligibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('サイクルが存在しない場合 CycleAggregationNotFoundError をスローする', async () => {
    const db = makePrisma({ cycle: null })
    const svc = createCycleAggregationService(db as never)
    await expect(svc.checkEligibility('no-such', ['u1'])).rejects.toBeInstanceOf(
      CycleAggregationNotFoundError,
    )
  })

  it('hireDate が null のユーザーは eligible=true', async () => {
    const db = makePrisma({ users: [{ id: 'u1', hireDate: null }] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.checkEligibility('cycle-1', ['u1'])
    expect(result).toHaveLength(1)
    const first = result[0]!
    expect(first.eligible).toBe(true)
    expect(first.tenureRatio).toBeNull()
  })

  it('サイクル開始前に入社したユーザーは eligible=true (tenureRatio=1)', async () => {
    const db = makePrisma({ users: [{ id: 'u1', hireDate: new Date('2025-12-01') }] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.checkEligibility('cycle-1', ['u1'])
    expect(result).toHaveLength(1)
    const first = result[0]!
    expect(first.eligible).toBe(true)
    expect(first.tenureRatio).toBe(1)
  })

  it('在籍期間50%以上のユーザーは eligible=true (Req 8.18)', async () => {
    // cycle: 2026-01-01〜2026-03-31 (89日)、hireDate: 2026-02-14 → 残り45日/89日≈0.506
    const db = makePrisma({ users: [{ id: 'u1', hireDate: new Date('2026-02-14') }] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.checkEligibility('cycle-1', ['u1'])
    expect(result).toHaveLength(1)
    const first = result[0]!
    expect(first.eligible).toBe(true)
    expect(first.tenureRatio).toBeGreaterThanOrEqual(0.5)
  })

  it('在籍期間50%未満のユーザーは eligible=false (Req 8.18)', async () => {
    // hireDate: 2026-03-01 → 残り30日/89日≈0.337
    const db = makePrisma({ users: [{ id: 'u1', hireDate: new Date('2026-03-01') }] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.checkEligibility('cycle-1', ['u1'])
    expect(result).toHaveLength(1)
    const first = result[0]!
    expect(first.eligible).toBe(false)
    expect(first.tenureRatio).toBeLessThan(0.5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// invalidateResignedAssignments (Req 8.19)
// ─────────────────────────────────────────────────────────────────────────────

describe('CycleAggregationService.invalidateResignedAssignments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('サイクルが存在しない場合 CycleAggregationNotFoundError をスローする', async () => {
    const db = makePrisma({ cycle: null })
    const svc = createCycleAggregationService(db as never)
    await expect(svc.invalidateResignedAssignments('no-such')).rejects.toBeInstanceOf(
      CycleAggregationNotFoundError,
    )
  })

  it('退職者の割り当てがない場合は invalidated=0 を返す', async () => {
    const db = makePrisma({ assignments: [] })
    const svc = createCycleAggregationService(db as never)
    const result = await svc.invalidateResignedAssignments('cycle-1')
    expect(result).toEqual({ invalidated: 0 })
  })

  it('退職者の ACTIVE な割り当てを無効化して件数を返す (Req 8.19)', async () => {
    const updated = { id: 'a1', status: 'DECLINED' }
    const db = {
      reviewCycle: { findUnique: vi.fn().mockResolvedValue(BASE_CYCLE) },
      reviewAssignment: {
        findMany: vi.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
        update: vi.fn().mockResolvedValue(updated),
      },
      evaluationResponse: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([updated, updated]),
    }
    const svc = createCycleAggregationService(db as never)
    const result = await svc.invalidateResignedAssignments('cycle-1')
    expect(result.invalidated).toBe(2)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
