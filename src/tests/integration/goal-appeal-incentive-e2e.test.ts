/**
 * Issue #81 / Task 23.2: 目標・異議申立て・インセンティブの E2E
 *
 * 既存 API ルートを横断して以下を検証する:
 * - 目標登録 -> 承認 -> 進捗更新 -> 評価連携
 * - 異議申立て -> 審査 -> 認容 -> 再計算
 * - インセンティブ加算と総合評価反映
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { PersonalGoalService } from '@/lib/goal/personal-goal-service'
import type { GoalProgressService } from '@/lib/goal/goal-progress-service'
import type { GoalAchievementService } from '@/lib/goal/goal-achievement-service'
import type {
  EvaluationCycleRecord,
  GoalAchievementRecord,
  GoalAchievementSummary,
} from '@/lib/goal/goal-achievement-types'
import type {
  GoalProgressRecord,
  ProgressUpdate,
} from '@/lib/goal/goal-progress-types'
import type {
  GoalStatus,
  PersonalGoalInput,
  PersonalGoalRecord,
} from '@/lib/goal/personal-goal-types'
import {
  PersonalGoalInvalidTransitionError,
  PersonalGoalNotFoundError,
} from '@/lib/goal/personal-goal-types'
import type {
  Appeal,
  AppealInput,
  AppealReviewInput,
  AppealService,
  AppealStatus,
} from '@/lib/appeal/appeal-types'
import {
  AppealInvalidStatusTransitionError,
  AppealNotFoundError,
  AppealTargetNotFoundError,
} from '@/lib/appeal/appeal-types'
import type {
  IncentiveScore,
  IncentiveService,
} from '@/lib/incentive/incentive-types'
import type {
  TotalEvaluationPreview,
  TotalEvaluationPreviewResult,
  TotalEvaluationResult,
  TotalEvaluationService,
} from '@/lib/total-evaluation/total-evaluation-types'
import {
  clearPersonalGoalServiceForTesting,
  setPersonalGoalServiceForTesting,
} from '@/lib/goal/personal-goal-service-di'
import {
  clearGoalProgressServiceForTesting,
  setGoalProgressServiceForTesting,
} from '@/lib/goal/goal-progress-service-di'
import {
  clearGoalAchievementServiceForTesting,
  setGoalAchievementServiceForTesting,
} from '@/lib/goal/goal-achievement-service-di'
import {
  clearAppealServiceForTesting,
  setAppealServiceForTesting,
} from '@/lib/appeal/appeal-service-di'
import {
  clearIncentiveServiceForTesting,
  setIncentiveServiceForTesting,
} from '@/lib/incentive/incentive-service-di'
import {
  clearTotalEvaluationServiceForTesting,
  setTotalEvaluationServiceForTesting,
} from '@/lib/total-evaluation/total-evaluation-service-di'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST: createPersonalGoalPOST } = await import('@/app/api/goals/personal/route')
const { POST: submitPersonalGoalPOST } = await import('@/app/api/goals/personal/[id]/submit/route')
const { POST: approvePersonalGoalPOST } = await import('@/app/api/goals/personal/[id]/approve/route')
const { POST: recordGoalProgressPOST } = await import('@/app/api/goals/personal/[id]/progress/route')
const { POST: createAchievementCyclePOST } = await import('@/app/api/goals/achievements/cycles/route')
const { POST: linkGoalsToCyclePOST } = await import(
  '@/app/api/goals/achievements/cycles/[cycleId]/link/route'
)
const { GET: getAchievementSummaryGET } = await import(
  '@/app/api/goals/achievements/cycles/[cycleId]/users/[userId]/route'
)
const { POST: submitAppealPOST, GET: listPendingAppealsGET } = await import('@/app/api/appeals/route')
const { PATCH: reviewAppealPATCH } = await import('@/app/api/appeals/[appealId]/route')
const { GET: getIncentiveScoreGET } = await import('@/app/api/incentive/score/route')
const { GET: previewTotalEvaluationGET } = await import('@/app/api/total-evaluation/preview/route')
const { POST: finalizeTotalEvaluationPOST } = await import('@/app/api/total-evaluation/finalize/route')

type AppSession = {
  user: { email: string }
  userId: string
  role: 'EMPLOYEE' | 'MANAGER' | 'HR_MANAGER' | 'ADMIN'
}

type HarnessState = {
  now: Date
  goalSeq: number
  progressSeq: number
  cycleSeq: number
  achievementSeq: number
  appealSeq: number
  goals: Map<string, PersonalGoalRecord>
  progressHistory: Map<string, GoalProgressRecord[]>
  cycles: Map<string, EvaluationCycleRecord>
  achievementsByCycle: Map<string, GoalAchievementRecord[]>
  appeals: Map<string, Appeal>
  incentiveScores: Map<string, IncentiveScore>
  previews: Map<string, TotalEvaluationPreview>
}

function makeEmployeeSession(userId = 'user-1'): AppSession {
  return {
    user: { email: `${userId}@example.com` },
    userId,
    role: 'EMPLOYEE',
  }
}

function makeHrSession(userId = 'hr-1'): AppSession {
  return {
    user: { email: 'hr@example.com' },
    userId,
    role: 'HR_MANAGER',
  }
}

function setSession(session: AppSession | null) {
  mockedGetServerSession.mockResolvedValue(session)
}

function makeRouteContext<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function previewResult(finalScore: number, goalScore: number): TotalEvaluationPreviewResult {
  return {
    id: 'te-user-1',
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    gradeId: 'grade-1',
    gradeLabel: 'G4',
    performanceScore: 80,
    goalScore,
    feedbackScore: 78,
    incentiveAdjustment: 2.4,
    performanceWeight: 0.4,
    goalWeight: 0.3,
    feedbackWeight: 0.3,
    finalScore,
    status: 'PENDING_FINALIZATION',
    calculatedAt: new Date('2026-04-21T00:00:00.000Z'),
    finalizedAt: null,
    hasWeightOverride: false,
    isNearGradeThreshold: false,
    nearestGradeThresholdScore: null,
    thresholdDistancePercent: null,
  }
}

function transitionGoalStatus(current: GoalStatus, next: GoalStatus): void {
  const transitions: Record<GoalStatus, GoalStatus[]> = {
    DRAFT: ['PENDING_APPROVAL'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
    APPROVED: ['IN_PROGRESS'],
    REJECTED: [],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED: [],
  }

  if (!transitions[current].includes(next)) {
    throw new PersonalGoalInvalidTransitionError(current, next)
  }
}

function createHarness() {
  const state: HarnessState = {
    now: new Date('2026-04-21T09:00:00.000Z'),
    goalSeq: 0,
    progressSeq: 0,
    cycleSeq: 0,
    achievementSeq: 0,
    appealSeq: 0,
    goals: new Map(),
    progressHistory: new Map(),
    cycles: new Map(),
    achievementsByCycle: new Map(),
    appeals: new Map(),
    incentiveScores: new Map([['cycle-1:user-1', { evaluationCount: 2, cumulativeScore: 2.4 }]]),
    previews: new Map([
      [
        'cycle-1',
        {
          cycleId: 'cycle-1',
          results: [previewResult(77.8, 60)],
        },
      ],
    ]),
  }

  const latestProgress = (goalId: string) => {
    const history = state.progressHistory.get(goalId) ?? []
    return history.at(-1)?.progressRate ?? 0
  }

  const personalGoalService: PersonalGoalService = {
    async createGoal(userId, input) {
      state.goalSeq += 1
      const goal: PersonalGoalRecord = {
        id: `goal-${state.goalSeq}`,
        userId,
        title: input.title,
        description: input.description ?? null,
        goalType: input.goalType,
        keyResult: input.keyResult ?? null,
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? null,
        status: 'DRAFT',
        parentOrgGoalId: input.parentOrgGoalId ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        approvedBy: null,
        approvedAt: null,
        rejectedAt: null,
        rejectedReason: null,
        createdAt: state.now,
        updatedAt: state.now,
      }
      state.goals.set(goal.id, goal)
      return goal
    },
    async submitForApproval(goalId) {
      const goal = state.goals.get(goalId)
      if (!goal) throw new PersonalGoalNotFoundError(goalId)
      transitionGoalStatus(goal.status, 'PENDING_APPROVAL')
      const updated = { ...goal, status: 'PENDING_APPROVAL' as const, updatedAt: state.now }
      state.goals.set(goalId, updated)
      return updated
    },
    async approveGoal(goalId, approvedBy) {
      const goal = state.goals.get(goalId)
      if (!goal) throw new PersonalGoalNotFoundError(goalId)
      transitionGoalStatus(goal.status, 'APPROVED')
      const updated = {
        ...goal,
        status: 'APPROVED' as const,
        approvedBy,
        approvedAt: state.now,
        updatedAt: state.now,
      }
      state.goals.set(goalId, updated)
      return updated
    },
    async rejectGoal(goalId, rejectedBy, reason) {
      const goal = state.goals.get(goalId)
      if (!goal) throw new PersonalGoalNotFoundError(goalId)
      transitionGoalStatus(goal.status, 'REJECTED')
      const updated = {
        ...goal,
        status: 'REJECTED' as const,
        approvedBy: rejectedBy,
        rejectedReason: reason,
        rejectedAt: state.now,
        updatedAt: state.now,
      }
      state.goals.set(goalId, updated)
      return updated
    },
    async startGoal(goalId) {
      const goal = state.goals.get(goalId)
      if (!goal) throw new PersonalGoalNotFoundError(goalId)
      transitionGoalStatus(goal.status, 'IN_PROGRESS')
      const updated = { ...goal, status: 'IN_PROGRESS' as const, updatedAt: state.now }
      state.goals.set(goalId, updated)
      return updated
    },
    async completeGoal(goalId) {
      const goal = state.goals.get(goalId)
      if (!goal) throw new PersonalGoalNotFoundError(goalId)
      transitionGoalStatus(goal.status, 'COMPLETED')
      const updated = { ...goal, status: 'COMPLETED' as const, updatedAt: state.now }
      state.goals.set(goalId, updated)
      return updated
    },
    async listMyGoals(userId) {
      return Array.from(state.goals.values()).filter((goal) => goal.userId === userId)
    },
    async getGoal(goalId) {
      return state.goals.get(goalId) ?? null
    },
  }

  const goalProgressService: GoalProgressService = {
    async recordProgress(goalId, update, recordedBy) {
      state.progressSeq += 1
      const record: GoalProgressRecord = {
        id: `progress-${state.progressSeq}`,
        goalId,
        progressRate: update.progressRate,
        comment: update.comment ?? null,
        recordedBy,
        recordedAt: state.now,
      }
      const history = state.progressHistory.get(goalId) ?? []
      state.progressHistory.set(goalId, [...history, record])
      return record
    },
    async getProgressHistory(goalId) {
      return state.progressHistory.get(goalId) ?? []
    },
    async listSubordinateGoals() {
      return []
    },
  }

  const goalAchievementService: GoalAchievementService = {
    async createCycle(input) {
      state.cycleSeq += 1
      const cycle: EvaluationCycleRecord = {
        id: `cycle-${state.cycleSeq}`,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        createdAt: state.now,
      }
      state.cycles.set(cycle.id, cycle)
      return cycle
    },
    async linkGoalsToCycle(cycleId) {
      const cycle = state.cycles.get(cycleId)
      if (!cycle) {
        throw new Error(`Cycle not found: ${cycleId}`)
      }

      const achievements = Array.from(state.goals.values())
        .filter((goal) => goal.endDate >= cycle.startDate && goal.endDate <= cycle.endDate)
        .map((goal) => {
          state.achievementSeq += 1
          return {
            id: `achievement-${state.achievementSeq}`,
            cycleId,
            goalId: goal.id,
            userId: goal.userId,
            finalProgress: latestProgress(goal.id),
            isCompleted: goal.status === 'COMPLETED',
            achievementNote: null,
            linkedAt: state.now,
          } satisfies GoalAchievementRecord
        })

      state.achievementsByCycle.set(cycleId, achievements)

      const currentPreview = state.previews.get(cycleId)
      if (currentPreview) {
        const summary = achievements.find((achievement) => achievement.userId === 'user-1')
        if (summary) {
          state.previews.set(cycleId, {
            cycleId,
            results: [previewResult(82.3, summary.finalProgress)],
          })
        }
      }

      return { linked: achievements.length }
    },
    async getAchievementSummary(cycleId, userId) {
      const achievements = (state.achievementsByCycle.get(cycleId) ?? []).filter(
        (achievement) => achievement.userId === userId,
      )

      const summary: GoalAchievementSummary = {
        userId,
        totalGoals: achievements.length,
        completedGoals: achievements.filter((achievement) => achievement.isCompleted).length,
        averageProgress:
          achievements.length === 0
            ? 0
            : Math.round(
                achievements.reduce((sum, achievement) => sum + achievement.finalProgress, 0) /
                  achievements.length,
              ),
        achievements,
      }
      return summary
    },
    async listCycleAchievements(cycleId) {
      const achievements = state.achievementsByCycle.get(cycleId) ?? []
      const grouped = new Map<string, GoalAchievementRecord[]>()
      for (const achievement of achievements) {
        const current = grouped.get(achievement.userId) ?? []
        grouped.set(achievement.userId, [...current, achievement])
      }

      return Array.from(grouped.entries()).map(([userId, userAchievements]) => ({
        userId,
        totalGoals: userAchievements.length,
        completedGoals: userAchievements.filter((achievement) => achievement.isCompleted).length,
        averageProgress:
          userAchievements.length === 0
            ? 0
            : Math.round(
                userAchievements.reduce((sum, achievement) => sum + achievement.finalProgress, 0) /
                  userAchievements.length,
              ),
        achievements: userAchievements,
      }))
    },
  }

  const appealService: AppealService = {
    async submitAppeal(appellantId, input) {
      if (input.targetType !== 'TOTAL_EVALUATION' || input.targetId !== 'te-user-1') {
        throw new AppealTargetNotFoundError(input.targetType, input.targetId)
      }

      state.appealSeq += 1
      const appeal: Appeal = {
        id: `appeal-${state.appealSeq}`,
        appellantId,
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        desiredOutcome: input.desiredOutcome ?? null,
        status: 'SUBMITTED',
        reviewerId: null,
        reviewComment: null,
        reviewedAt: null,
        submittedAt: state.now,
        retainedUntil: new Date('2028-04-21T00:00:00.000Z'),
        recalculationRequestedAt: null,
      }
      state.appeals.set(appeal.id, appeal)
      return appeal
    },
    async listPending() {
      return Array.from(state.appeals.values()).filter((appeal) =>
        ['SUBMITTED', 'UNDER_REVIEW'].includes(appeal.status),
      )
    },
    async review(hrManagerId, appealId, input) {
      const appeal = state.appeals.get(appealId)
      if (!appeal) throw new AppealNotFoundError(appealId)

      const allowedTransitions: Record<AppealStatus, AppealStatus[]> = {
        SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
        UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
        ACCEPTED: [],
        REJECTED: [],
        WITHDRAWN: [],
      }

      if (!allowedTransitions[appeal.status].includes(input.status)) {
        throw new AppealInvalidStatusTransitionError(appeal.status, input.status)
      }

      const updated: Appeal = {
        ...appeal,
        status: input.status,
        reviewerId: hrManagerId,
        reviewComment: input.reviewComment,
        reviewedAt: state.now,
        recalculationRequestedAt: input.status === 'ACCEPTED' ? state.now : appeal.recalculationRequestedAt,
      }
      state.appeals.set(appealId, updated)

      if (input.status === 'ACCEPTED') {
        state.previews.set('cycle-1', {
          cycleId: 'cycle-1',
          results: [previewResult(86.2, 90)],
        })
      }

      return updated
    },
  }

  const incentiveService: IncentiveService = {
    async applyIncentive() {
      return
    },
    async getCumulativeScore(userId, cycleId) {
      return state.incentiveScores.get(`${cycleId}:${userId}`) ?? { evaluationCount: 0, cumulativeScore: 0 }
    },
    async getAdjustmentForTotalEvaluation(cycleId) {
      const map = new Map<string, number>()
      for (const [key, value] of state.incentiveScores.entries()) {
        const [scoreCycleId, userId] = key.split(':')
        if (scoreCycleId === cycleId && userId) {
          map.set(userId, value.cumulativeScore)
        }
      }
      return map
    },
  }

  const totalEvaluationService: TotalEvaluationService = {
    async calculateAll() {
      return []
    },
    async calculateSubject(cycleId, subjectId) {
      const preview = state.previews.get(cycleId)
      const result = preview?.results.find((entry) => entry.subjectId === subjectId)
      if (!result) throw new Error(`Preview not found for ${cycleId}/${subjectId}`)
      return result
    },
    async scheduleCalculateAll() {
      return { enqueued: 0, jobIds: [] }
    },
    async previewBeforeFinalize(cycleId) {
      return state.previews.get(cycleId) ?? { cycleId, results: [] }
    },
    async getWeightOverride() {
      return null
    },
    async overrideWeight() {
      throw new Error('Not implemented in harness')
    },
    async finalize(input) {
      const preview = state.previews.get(input.cycleId) ?? { cycleId: input.cycleId, results: [] }
      const finalized = preview.results.map(
        (result): TotalEvaluationResult => ({
          ...result,
          status: 'FINALIZED',
          finalizedAt: state.now,
        }),
      )
      state.previews.set(input.cycleId, {
        cycleId: input.cycleId,
        results: finalized.map((result) => ({
          ...result,
          hasWeightOverride: false,
          isNearGradeThreshold: false,
          nearestGradeThresholdScore: null,
          thresholdDistancePercent: null,
        })),
      })
      return finalized
    },
    async correctAfterFinalize() {
      throw new Error('Not implemented in harness')
    },
  }

  return {
    personalGoalService,
    goalProgressService,
    goalAchievementService,
    appealService,
    incentiveService,
    totalEvaluationService,
  }
}

function makeGoalInput(overrides?: Partial<PersonalGoalInput>) {
  return {
    title: '四半期の技術改善を推進する',
    description: '運用負荷の高い箇所を整理して改善する',
    goalType: 'MBO' as const,
    targetValue: 3,
    unit: '件',
    startDate: '2026-04-01T00:00:00.000Z',
    endDate: '2026-04-30T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearPersonalGoalServiceForTesting()
  clearGoalProgressServiceForTesting()
  clearGoalAchievementServiceForTesting()
  clearAppealServiceForTesting()
  clearIncentiveServiceForTesting()
  clearTotalEvaluationServiceForTesting()
})

describe('目標・異議申立て・インセンティブ E2E', () => {
  it('目標登録から認容後の総合評価再計算までを通しで確認できる', async () => {
    const harness = createHarness()
    setPersonalGoalServiceForTesting(harness.personalGoalService)
    setGoalProgressServiceForTesting(harness.goalProgressService)
    setGoalAchievementServiceForTesting(harness.goalAchievementService)
    setAppealServiceForTesting(harness.appealService)
    setIncentiveServiceForTesting(harness.incentiveService)
    setTotalEvaluationServiceForTesting(harness.totalEvaluationService)

    setSession(makeEmployeeSession('user-1'))
    const createGoalRes = await createPersonalGoalPOST(
      new NextRequest('http://localhost/api/goals/personal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makeGoalInput()),
      }),
    )
    expect(createGoalRes.status).toBe(201)
    const createGoalJson = await createGoalRes.json()
    const goalId = createGoalJson.data.id as string

    const submitGoalRes = await submitPersonalGoalPOST(
      new NextRequest(`http://localhost/api/goals/personal/${goalId}/submit`, { method: 'POST' }),
      makeRouteContext({ id: goalId }),
    )
    expect(submitGoalRes.status).toBe(200)

    setSession(makeHrSession('hr-1'))
    const approveGoalRes = await approvePersonalGoalPOST(
      new NextRequest(`http://localhost/api/goals/personal/${goalId}/approve`, { method: 'POST' }),
      makeRouteContext({ id: goalId }),
    )
    expect(approveGoalRes.status).toBe(200)

    setSession(makeEmployeeSession('user-1'))
    const progressRes = await recordGoalProgressPOST(
      new NextRequest(`http://localhost/api/goals/personal/${goalId}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          progressRate: 75,
          comment: '改善対象の 4 分の 3 を完了した',
        } satisfies ProgressUpdate),
      }),
      makeRouteContext({ id: goalId }),
    )
    expect(progressRes.status).toBe(201)

    setSession(makeHrSession('hr-1'))
    const createCycleRes = await createAchievementCyclePOST(
      new NextRequest('http://localhost/api/goals/achievements/cycles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '2026 Q2 Evaluation',
          startDate: '2026-04-01T00:00:00.000Z',
          endDate: '2026-04-30T00:00:00.000Z',
        }),
      }),
    )
    expect(createCycleRes.status).toBe(201)
    const createCycleJson = await createCycleRes.json()
    const cycleId = createCycleJson.data.id as string

    const linkGoalsRes = await linkGoalsToCyclePOST(
      new NextRequest(`http://localhost/api/goals/achievements/cycles/${cycleId}/link`, {
        method: 'POST',
      }),
      makeRouteContext({ cycleId }),
    )
    expect(linkGoalsRes.status).toBe(200)
    const linkGoalsJson = await linkGoalsRes.json()
    expect(linkGoalsJson.data.linked).toBe(1)

    const summaryRes = await getAchievementSummaryGET(
      new NextRequest(
        `http://localhost/api/goals/achievements/cycles/${cycleId}/users/user-1`,
      ),
      makeRouteContext({ cycleId, userId: 'user-1' }),
    )
    expect(summaryRes.status).toBe(200)
    const summaryJson = await summaryRes.json()
    expect(summaryJson.data.averageProgress).toBe(75)
    expect(summaryJson.data.totalGoals).toBe(1)

    setSession(makeEmployeeSession('user-1'))
    const incentiveRes = await getIncentiveScoreGET(
      new NextRequest(`http://localhost/api/incentive/score?cycleId=${cycleId}`),
    )
    expect(incentiveRes.status).toBe(200)
    const incentiveJson = await incentiveRes.json()
    expect(incentiveJson.data).toEqual({ evaluationCount: 2, cumulativeScore: 2.4 })

    setSession(makeHrSession('hr-1'))
    const initialPreviewRes = await previewTotalEvaluationGET(
      new NextRequest(`http://localhost/api/total-evaluation/preview?cycleId=${cycleId}`),
    )
    expect(initialPreviewRes.status).toBe(200)
    const initialPreviewJson = await initialPreviewRes.json()
    expect(initialPreviewJson.data.results[0].goalScore).toBe(75)
    expect(initialPreviewJson.data.results[0].incentiveAdjustment).toBe(2.4)
    expect(initialPreviewJson.data.results[0].finalScore).toBe(82.3)

    setSession(makeEmployeeSession('user-1'))
    const submitAppealRes = await submitAppealPOST(
      new NextRequest('http://localhost/api/appeals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType: 'TOTAL_EVALUATION',
          targetId: 'te-user-1',
          reason: '目標達成の証跡が一部反映されていない',
          desiredOutcome: '進捗証跡を再評価して総合評価を見直してほしい',
        } satisfies AppealInput),
      }),
    )
    expect(submitAppealRes.status).toBe(201)
    const submitAppealJson = await submitAppealRes.json()
    const appealId = submitAppealJson.data.id as string
    expect(submitAppealJson.data.status).toBe('SUBMITTED')

    setSession(makeHrSession('hr-1'))
    const listPendingRes = await listPendingAppealsGET()
    expect(listPendingRes.status).toBe(200)
    const listPendingJson = await listPendingRes.json()
    expect(listPendingJson.data).toHaveLength(1)
    expect(listPendingJson.data[0].id).toBe(appealId)

    const underReviewRes = await reviewAppealPATCH(
      new NextRequest(`http://localhost/api/appeals/${appealId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'UNDER_REVIEW',
          reviewComment: '進捗証跡と評価連携の差分を確認中',
        } satisfies AppealReviewInput),
      }),
      makeRouteContext({ appealId }),
    )
    expect(underReviewRes.status).toBe(200)

    const unchangedPreviewRes = await previewTotalEvaluationGET(
      new NextRequest(`http://localhost/api/total-evaluation/preview?cycleId=${cycleId}`),
    )
    const unchangedPreviewJson = await unchangedPreviewRes.json()
    expect(unchangedPreviewJson.data.results[0].finalScore).toBe(82.3)

    const acceptAppealRes = await reviewAppealPATCH(
      new NextRequest(`http://localhost/api/appeals/${appealId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'ACCEPTED',
          reviewComment: '進捗実績を反映して再計算する',
        } satisfies AppealReviewInput),
      }),
      makeRouteContext({ appealId }),
    )
    expect(acceptAppealRes.status).toBe(200)
    const acceptAppealJson = await acceptAppealRes.json()
    expect(acceptAppealJson.data.recalculationRequestedAt).not.toBeNull()

    const recalculatedPreviewRes = await previewTotalEvaluationGET(
      new NextRequest(`http://localhost/api/total-evaluation/preview?cycleId=${cycleId}`),
    )
    expect(recalculatedPreviewRes.status).toBe(200)
    const recalculatedPreviewJson = await recalculatedPreviewRes.json()
    expect(recalculatedPreviewJson.data.results[0].goalScore).toBe(90)
    expect(recalculatedPreviewJson.data.results[0].incentiveAdjustment).toBe(2.4)
    expect(recalculatedPreviewJson.data.results[0].finalScore).toBe(86.2)

    const finalizeRes = await finalizeTotalEvaluationPOST(
      new NextRequest('http://localhost/api/total-evaluation/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cycleId }),
      }),
    )
    expect(finalizeRes.status).toBe(200)
    const finalizeJson = await finalizeRes.json()
    expect(finalizeJson.data[0].status).toBe('FINALIZED')
    expect(finalizeJson.data[0].finalScore).toBe(86.2)
    expect(finalizeJson.data[0].incentiveAdjustment).toBe(2.4)
  })
})
