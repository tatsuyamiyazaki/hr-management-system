/**
 * Issue #80 / Task 23.1: 360度評価ライフサイクルのE2Eシナリオテスト
 *
 * 既存APIルートをまたいで以下を検証する:
 * - サイクル作成 -> 自己/ピア評価 -> AI品質ゲート -> 集計 -> HRレビュー -> 公開 -> 閲覧
 * - 公開DTOに evaluatorId が含まれない回帰防止
 * - 最少レビュアー数を満たさない対象は公開承認フェーズへ進めない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type {
  ReviewCycleInput,
  ReviewCycleRecord,
  ReviewCycleStatus,
} from '@/lib/evaluation/review-cycle-types'
import {
  ReviewCycleInvalidTransitionError,
  ReviewCycleNotFoundError,
} from '@/lib/evaluation/review-cycle-types'
import type { ReviewCycleService } from '@/lib/evaluation/review-cycle-service'
import type {
  EvaluationResponseInput,
  EvaluationResponseRecord,
  EvaluationResponseType,
  AnonymousEvaluationResponseRecord,
} from '@/lib/evaluation/evaluation-response-types'
import {
  EvaluationAlreadySubmittedError,
  EvaluationNotAssignedError,
} from '@/lib/evaluation/evaluation-response-types'
import type { EvaluationResponseService } from '@/lib/evaluation/evaluation-response-service'
import type {
  AggregatedUserResult,
  CycleAggregationResult,
} from '@/lib/evaluation/cycle-aggregation-types'
import {
  CycleAggregationInvalidStatusError,
  CycleAggregationNotFoundError,
} from '@/lib/evaluation/cycle-aggregation-types'
import type { CycleAggregationService } from '@/lib/evaluation/cycle-aggregation-service'
import type { AICoachService } from '@/lib/ai-coach/ai-coach-service'
import type { ChatTurn, ValidateInput, ValidateResult } from '@/lib/ai-coach/ai-coach-types'
import type {
  FeedbackPreview,
  FeedbackService,
  FeedbackTransformResult,
  PublishedFeedback,
} from '@/lib/feedback/feedback-types'
import {
  FeedbackInvalidStatusError,
  FeedbackNotFoundError,
} from '@/lib/feedback/feedback-service'
import {
  clearReviewCycleServiceForTesting,
  setReviewCycleServiceForTesting,
} from '@/lib/evaluation/review-cycle-service-di'
import {
  clearEvaluationResponseServiceForTesting,
  setEvaluationResponseServiceForTesting,
} from '@/lib/evaluation/evaluation-response-service-di'
import {
  clearCycleAggregationServiceForTesting,
  setCycleAggregationServiceForTesting,
} from '@/lib/evaluation/cycle-aggregation-service-di'
import {
  clearAICoachServiceForTesting,
  setAICoachServiceForTesting,
} from '@/lib/ai-coach/ai-coach-service-di'
import {
  clearFeedbackServiceForTesting,
  setFeedbackServiceForTesting,
} from '@/lib/feedback/feedback-service-di'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST: createCyclePOST } = await import('@/app/api/evaluation/cycles/route')
const { POST: activateCyclePOST } = await import('@/app/api/evaluation/cycles/[id]/activate/route')
const { POST: aggregateCyclePOST } = await import('@/app/api/evaluation/cycles/[id]/aggregate/route')
const { POST: runAggregationPOST } = await import(
  '@/app/api/evaluation/cycles/[id]/run-aggregation/route'
)
const { POST: pendingApprovalPOST } = await import(
  '@/app/api/evaluation/cycles/[id]/pending-approval/route'
)
const { POST: finalizeCyclePOST } = await import('@/app/api/evaluation/cycles/[id]/finalize/route')
const { POST: submitResponsePOST } = await import('@/app/api/evaluation/responses/submit/route')
const { POST: validateCommentPOST } = await import('@/app/api/evaluation/ai-coach/validate/route')
const { GET: previewFeedbackGET } = await import('@/app/api/feedback/preview/route')
const { POST: approveFeedbackPOST } = await import('@/app/api/feedback/approve/route')
const { GET: publishedFeedbackGET } = await import('@/app/api/feedback/published/route')

type AppSession = {
  user: { email: string }
  userId: string
  role: 'HR_MANAGER' | 'EMPLOYEE' | 'ADMIN'
}

type HarnessState = {
  cycleSeq: number
  responseSeq: number
  feedbackSeq: number
  nowIso: string
  cycles: Map<string, ReviewCycleRecord>
  responses: EvaluationResponseRecord[]
  assignments: Set<string>
  latestAggregation: Map<string, CycleAggregationResult>
  feedbackResults: Map<string, FeedbackTransformResult>
  aiValidations: ValidateInput[]
}

function makeHrSession(userId = 'hr-1'): AppSession {
  return {
    user: { email: 'hr@example.com' },
    userId,
    role: 'HR_MANAGER',
  }
}

function makeEmployeeSession(userId: string): AppSession {
  return {
    user: { email: `${userId}@example.com` },
    userId,
    role: 'EMPLOYEE',
  }
}

function makeRouteContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function feedbackKey(cycleId: string, subjectId: string): string {
  return `${cycleId}:${subjectId}`
}

function assignmentKey(cycleId: string, evaluatorId: string, targetUserId: string): string {
  return `${cycleId}:${evaluatorId}:${targetUserId}`
}

function cloneCycle(
  current: ReviewCycleRecord,
  updates: Partial<ReviewCycleRecord>,
): ReviewCycleRecord {
  return {
    ...current,
    ...updates,
    items: updates.items ? [...updates.items] : [...current.items],
  }
}

function createHarness() {
  const state: HarnessState = {
    cycleSeq: 0,
    responseSeq: 0,
    feedbackSeq: 0,
    nowIso: '2026-04-21T09:00:00.000Z',
    cycles: new Map(),
    responses: [],
    assignments: new Set([
      assignmentKey('cycle-1', 'peer-1', 'subject-1'),
      assignmentKey('cycle-1', 'peer-2', 'subject-1'),
      assignmentKey('cycle-2', 'peer-1', 'subject-2'),
    ]),
    latestAggregation: new Map(),
    feedbackResults: new Map(),
    aiValidations: [],
  }

  function nextCycleId() {
    state.cycleSeq += 1
    return `cycle-${state.cycleSeq}`
  }

  function nextResponseId() {
    state.responseSeq += 1
    return `resp-${state.responseSeq}`
  }

  function nextFeedbackId() {
    state.feedbackSeq += 1
    return `feedback-${state.feedbackSeq}`
  }

  function updateCycleStatus(cycleId: string, nextStatus: ReviewCycleStatus): ReviewCycleRecord {
    const current = state.cycles.get(cycleId)
    if (!current) {
      throw new ReviewCycleNotFoundError(cycleId)
    }

    const allowedTransitions: Record<ReviewCycleStatus, ReviewCycleStatus[]> = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['AGGREGATING'],
      AGGREGATING: ['PENDING_FEEDBACK_APPROVAL'],
      PENDING_FEEDBACK_APPROVAL: ['FINALIZED'],
      FINALIZED: ['CLOSED'],
      CLOSED: [],
    }

    if (!allowedTransitions[current.status].includes(nextStatus)) {
      throw new ReviewCycleInvalidTransitionError(current.status, nextStatus)
    }

    const updated = cloneCycle(current, {
      status: nextStatus,
      updatedAt: new Date(state.nowIso),
      activatedAt: nextStatus === 'ACTIVE' ? new Date(state.nowIso) : current.activatedAt,
      finalizedAt: nextStatus === 'FINALIZED' ? new Date(state.nowIso) : current.finalizedAt,
      closedAt: nextStatus === 'CLOSED' ? new Date(state.nowIso) : current.closedAt,
    })
    state.cycles.set(cycleId, updated)
    return updated
  }

  function aggregate(cycleId: string): CycleAggregationResult {
    const cycle = state.cycles.get(cycleId)
    if (!cycle) {
      throw new CycleAggregationNotFoundError(cycleId)
    }
    if (!['AGGREGATING', 'PENDING_FEEDBACK_APPROVAL', 'FINALIZED'].includes(cycle.status)) {
      throw new CycleAggregationInvalidStatusError(cycle.status)
    }

    const targetIds = new Set(
      state.responses.filter((response) => response.cycleId === cycleId).map((response) => response.targetUserId),
    )

    const results: AggregatedUserResult[] = Array.from(targetIds).map((targetUserId) => {
      const targetResponses = state.responses.filter(
        (response) => response.cycleId === cycleId && response.targetUserId === targetUserId,
      )
      const peerResponses = targetResponses.filter((response) => response.responseType === 'PEER')
      const selfResponse =
        targetResponses.find((response) => response.responseType === 'SELF') ?? null
      const topDownResponse =
        targetResponses.find((response) => response.responseType === 'TOP_DOWN') ?? null

      const peerEvaluatorCount = peerResponses.length
      const peerScore =
        peerEvaluatorCount > 0
          ? peerResponses.reduce((sum, response) => sum + response.score, 0) / peerEvaluatorCount
          : null

      return {
        targetUserId,
        peerScore,
        peerEvaluatorCount,
        selfScore: selfResponse?.score ?? null,
        topDownScore: topDownResponse?.score ?? null,
        minimumNotMet: peerEvaluatorCount < cycle.minReviewers,
        anonymousComments: peerResponses
          .map((response) => response.comment)
          .filter((comment): comment is string => Boolean(comment)),
      }
    })

    const result: CycleAggregationResult = {
      cycleId,
      totalTargets: results.length,
      minimumNotMetCount: results.filter((entry) => entry.minimumNotMet).length,
      results,
    }

    state.latestAggregation.set(cycleId, result)
    return result
  }

  const reviewCycleService: ReviewCycleService = {
    async createCycle(createdBy, input) {
      const now = new Date(state.nowIso)
      const cycle: ReviewCycleRecord = {
        id: nextCycleId(),
        name: input.name,
        status: 'DRAFT',
        startDate: input.startDate,
        endDate: input.endDate,
        items: [...input.items],
        incentiveK: input.incentiveK,
        minReviewers: input.minReviewers,
        maxTargets: input.maxTargets,
        activatedAt: null,
        finalizedAt: null,
        closedAt: null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }
      state.cycles.set(cycle.id, cycle)
      return cycle
    },
    async activateCycle(cycleId) {
      return updateCycleStatus(cycleId, 'ACTIVE')
    },
    async startAggregating(cycleId) {
      return updateCycleStatus(cycleId, 'AGGREGATING')
    },
    async pendingApproval(cycleId) {
      const aggregation = state.latestAggregation.get(cycleId)
      if (!aggregation || aggregation.minimumNotMetCount > 0) {
        throw new ReviewCycleInvalidTransitionError('AGGREGATING', 'PENDING_FEEDBACK_APPROVAL')
      }
      return updateCycleStatus(cycleId, 'PENDING_FEEDBACK_APPROVAL')
    },
    async finalizeCycle(cycleId) {
      const aggregation = state.latestAggregation.get(cycleId)
      if (!aggregation) {
        throw new ReviewCycleInvalidTransitionError('PENDING_FEEDBACK_APPROVAL', 'FINALIZED')
      }

      for (const result of aggregation.results) {
        const transformedBatch = result.anonymousComments.map(
          (comment) => `建設的な表現に調整: ${comment}`,
        )
        state.feedbackResults.set(feedbackKey(cycleId, result.targetUserId), {
          id: nextFeedbackId(),
          cycleId,
          subjectId: result.targetUserId,
          rawCommentBatch: [...result.anonymousComments],
          transformedBatch,
          summary: transformedBatch.join(' / ') || 'コメントなし',
          status: 'PENDING_HR_APPROVAL',
        })
      }

      return updateCycleStatus(cycleId, 'FINALIZED')
    },
    async closeCycle(cycleId) {
      return updateCycleStatus(cycleId, 'CLOSED')
    },
    async listCycles(filters) {
      const values = Array.from(state.cycles.values())
      if (!filters?.status) return values
      return values.filter((cycle) => cycle.status === filters.status)
    },
    async getCycle(cycleId) {
      return state.cycles.get(cycleId) ?? null
    },
  }

  const evaluationResponseService: EvaluationResponseService = {
    async saveDraft(evaluatorId, input) {
      const existingIndex = state.responses.findIndex(
        (response) =>
          response.cycleId === input.cycleId &&
          response.evaluatorId === evaluatorId &&
          response.targetUserId === input.targetUserId &&
          response.responseType === input.responseType,
      )
      const existingResponse = existingIndex >= 0 ? state.responses[existingIndex] : undefined

      const record: EvaluationResponseRecord = {
        id: existingResponse?.id ?? nextResponseId(),
        cycleId: input.cycleId,
        evaluatorId,
        targetUserId: input.targetUserId,
        responseType: input.responseType,
        score: input.score,
        comment: input.comment ?? null,
        submittedAt: new Date(state.nowIso),
        isDraft: true,
      }

      if (existingIndex >= 0) {
        state.responses[existingIndex] = record
      } else {
        state.responses.push(record)
      }
      return record
    },
    async submit(evaluatorId, input) {
      const existingIndex = state.responses.findIndex(
        (response) =>
          response.cycleId === input.cycleId &&
          response.evaluatorId === evaluatorId &&
          response.targetUserId === input.targetUserId &&
          response.responseType === input.responseType,
      )
      const existingResponse = existingIndex >= 0 ? state.responses[existingIndex] : undefined

      if (existingResponse && !existingResponse.isDraft) {
        throw new EvaluationAlreadySubmittedError()
      }

      if (
        input.responseType !== 'SELF' &&
        !state.assignments.has(assignmentKey(input.cycleId, evaluatorId, input.targetUserId))
      ) {
        throw new EvaluationNotAssignedError()
      }

      const record: EvaluationResponseRecord = {
        id: existingResponse?.id ?? nextResponseId(),
        cycleId: input.cycleId,
        evaluatorId,
        targetUserId: input.targetUserId,
        responseType: input.responseType,
        score: input.score,
        comment: input.comment ?? null,
        submittedAt: new Date(state.nowIso),
        isDraft: false,
      }

      if (existingIndex >= 0) {
        state.responses[existingIndex] = record
      } else {
        state.responses.push(record)
      }
      return record
    },
    async listMyResponses(evaluatorId, cycleId) {
      return state.responses.filter(
        (response) => response.evaluatorId === evaluatorId && response.cycleId === cycleId,
      )
    },
    async listReceivedResponses(targetUserId, cycleId) {
      return state.responses
        .filter(
          (response) =>
            response.targetUserId === targetUserId &&
            response.cycleId === cycleId &&
            !response.isDraft,
        )
        .map(
          (response): AnonymousEvaluationResponseRecord => ({
            id: response.id,
            cycleId: response.cycleId,
            targetUserId: response.targetUserId,
            responseType: response.responseType,
            score: response.score,
            comment: response.comment,
            submittedAt: response.submittedAt,
            isDraft: response.isDraft,
          }),
        )
    },
    async listByCycle(cycleId) {
      return state.responses.filter((response) => response.cycleId === cycleId)
    },
  }

  const aggregationService: CycleAggregationService = {
    async aggregateCycle(cycleId) {
      return aggregate(cycleId)
    },
    async checkEligibility(_cycleId, userIds) {
      return userIds.map((userId) => ({ userId, eligible: true, tenureRatio: 1 }))
    },
    async invalidateResignedAssignments() {
      return { invalidated: 0 }
    },
  }

  const aiCoachService: AICoachService = {
    async validateComment(input) {
      state.aiValidations.push(input)
      const turnNumber = input.conversationHistory.length + 1
      const result: ValidateResult = {
        qualityOk: input.draftComment.includes('具体'),
        missingAspects: input.draftComment.includes('具体') ? [] : ['具体例'],
        suggestions: input.draftComment.includes('具体')
          ? ''
          : '成果や行動の具体例を足してください。',
        turnNumber,
      }
      return result
    },
  }

  const feedbackService: FeedbackService = {
    async scheduleTransform() {
      return
    },
    async previewTransformed(cycleId, subjectId) {
      const result = state.feedbackResults.get(feedbackKey(cycleId, subjectId))
      if (!result) return null
      const preview: FeedbackPreview = {
        cycleId: result.cycleId,
        subjectId: result.subjectId,
        transformedBatch: [...result.transformedBatch],
        summary: result.summary,
        status: result.status,
      }
      return preview
    },
    async approveAndPublish(cycleId, subjectId, approvedBy) {
      const key = feedbackKey(cycleId, subjectId)
      const result = state.feedbackResults.get(key)
      if (!result) {
        throw new FeedbackNotFoundError(cycleId, subjectId)
      }
      if (result.status !== 'PENDING_HR_APPROVAL') {
        throw new FeedbackInvalidStatusError('PENDING_HR_APPROVAL', result.status)
      }

      state.feedbackResults.set(key, {
        ...result,
        status: 'PUBLISHED',
        approvedBy,
        approvedAt: state.nowIso,
        publishedAt: state.nowIso,
      })
    },
    async getPublishedFor(subjectId) {
      const results = Array.from(state.feedbackResults.values()).filter(
        (result) => result.subjectId === subjectId && result.status === 'PUBLISHED' && result.publishedAt,
      )

      return results.map(
        (result): PublishedFeedback => ({
          id: result.id,
          cycleId: result.cycleId,
          subjectId: result.subjectId,
          transformedBatch: [...result.transformedBatch],
          summary: result.summary,
          publishedAt: result.publishedAt!,
        }),
      )
    },
    async recordView() {
      return
    },
    async archiveExpired() {
      return { archived: 0 }
    },
  }

  return {
    state,
    reviewCycleService,
    evaluationResponseService,
    aggregationService,
    aiCoachService,
    feedbackService,
  }
}

function setSession(session: AppSession | null) {
  mockedGetServerSession.mockResolvedValue(session)
}

function makeCycleBody(overrides?: Partial<ReviewCycleInput>) {
  return {
    name: 'FY2026 H1 360 Review',
    startDate: '2026-04-01T00:00:00.000Z',
    endDate: '2026-04-30T00:00:00.000Z',
    items: ['リーダーシップ', '協働', '成果'],
    incentiveK: 1.2,
    minReviewers: 2,
    maxTargets: 5,
    ...overrides,
  }
}

function makeSubmitBody(
  targetUserId: string,
  responseType: EvaluationResponseType,
  score: number,
  comment: string,
): EvaluationResponseInput {
  return {
    cycleId: '',
    targetUserId,
    responseType,
    score,
    comment,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearReviewCycleServiceForTesting()
  clearEvaluationResponseServiceForTesting()
  clearCycleAggregationServiceForTesting()
  clearAICoachServiceForTesting()
  clearFeedbackServiceForTesting()
})

describe('360度評価ライフサイクルE2E', () => {
  it('自己評価からHR承認公開までの一連フローを完了できる', async () => {
    const harness = createHarness()
    setReviewCycleServiceForTesting(harness.reviewCycleService)
    setEvaluationResponseServiceForTesting(harness.evaluationResponseService)
    setCycleAggregationServiceForTesting(harness.aggregationService)
    setAICoachServiceForTesting(harness.aiCoachService)
    setFeedbackServiceForTesting(harness.feedbackService)

    setSession(makeHrSession('hr-manager-1'))
    const createRes = await createCyclePOST(
      new NextRequest('http://localhost/api/evaluation/cycles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makeCycleBody()),
      }),
    )
    expect(createRes.status).toBe(201)
    const createdJson = await createRes.json()
    const cycleId = createdJson.data.id as string

    const activateRes = await activateCyclePOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/activate`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(activateRes.status).toBe(200)

    setSession(makeEmployeeSession('subject-1'))
    const selfRes = await submitResponsePOST(
      new NextRequest('http://localhost/api/evaluation/responses/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeSubmitBody('subject-1', 'SELF', 82, '自分の具体的な改善行動を振り返れた。'),
          cycleId,
        }),
      }),
    )
    expect(selfRes.status).toBe(200)

    setSession(makeEmployeeSession('peer-1'))
    const peerOneRes = await submitResponsePOST(
      new NextRequest('http://localhost/api/evaluation/responses/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeSubmitBody(
            'subject-1',
            'PEER',
            88,
            '具体的に周囲を巻き込みながら課題を前進させていた。',
          ),
          cycleId,
        }),
      }),
    )
    expect(peerOneRes.status).toBe(200)

    setSession(makeEmployeeSession('peer-2'))
    const peerTwoRes = await submitResponsePOST(
      new NextRequest('http://localhost/api/evaluation/responses/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeSubmitBody(
            'subject-1',
            'PEER',
            91,
            '具体例として、部門横断の調整を最後までやり切っていた。',
          ),
          cycleId,
        }),
      }),
    )
    expect(peerTwoRes.status).toBe(200)

    setSession(makeEmployeeSession('peer-1'))
    const validateRes = await validateCommentPOST(
      new NextRequest('http://localhost/api/evaluation/ai-coach/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          subjectRoleContext: 'エンジニア / シニア',
          draftComment: '具体的な成果と周囲への影響を書けているコメントです。',
          conversationHistory: [
            { role: 'assistant', content: '行動の具体例を入れてください。' } satisfies ChatTurn,
          ],
        }),
      }),
    )
    expect(validateRes.status).toBe(200)
    const validateJson = await validateRes.json()
    expect(validateJson.success).toBe(true)
    expect(validateJson.data.qualityOk).toBe(true)
    expect(harness.state.aiValidations).toHaveLength(1)
    expect(harness.state.aiValidations[0]?.evaluatorId).toBe('peer-1')

    setSession(makeHrSession('hr-manager-1'))
    const aggregateStatusRes = await aggregateCyclePOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/aggregate`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(aggregateStatusRes.status).toBe(200)

    const aggregateRunRes = await runAggregationPOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/run-aggregation`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(aggregateRunRes.status).toBe(200)
    const aggregateJson = await aggregateRunRes.json()
    expect(aggregateJson.data.minimumNotMetCount).toBe(0)
    expect(aggregateJson.data.results[0].peerEvaluatorCount).toBe(2)
    expect(aggregateJson.data.results[0].anonymousComments).toEqual([
      '具体的に周囲を巻き込みながら課題を前進させていた。',
      '具体例として、部門横断の調整を最後までやり切っていた。',
    ])

    const pendingApprovalRes = await pendingApprovalPOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/pending-approval`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(pendingApprovalRes.status).toBe(200)

    const finalizeRes = await finalizeCyclePOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/finalize`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(finalizeRes.status).toBe(200)

    const previewRes = await previewFeedbackGET(
      new NextRequest(
        `http://localhost/api/feedback/preview?cycleId=${cycleId}&subjectId=subject-1`,
      ),
    )
    expect(previewRes.status).toBe(200)
    const previewJson = await previewRes.json()
    expect(previewJson.data.status).toBe('PENDING_HR_APPROVAL')
    expect(previewJson.data.transformedBatch[0]).toContain('建設的な表現に調整')

    const approveRes = await approveFeedbackPOST(
      new NextRequest('http://localhost/api/feedback/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cycleId, subjectId: 'subject-1' }),
      }),
    )
    expect(approveRes.status).toBe(200)

    setSession(makeEmployeeSession('subject-1'))
    const publishedRes = await publishedFeedbackGET()
    expect(publishedRes.status).toBe(200)
    const publishedJson = await publishedRes.json()
    expect(publishedJson.data).toHaveLength(1)
    expect(publishedJson.data[0].subjectId).toBe('subject-1')
    expect(publishedJson.data[0]).not.toHaveProperty('evaluatorId')
    expect(publishedJson.data[0]).not.toHaveProperty('rawCommentBatch')
    expect(publishedJson.data[0]).not.toHaveProperty('approvedBy')
  })

  it('最少レビュアー数を満たさない対象は保留され、承認フェーズへ進めない', async () => {
    const harness = createHarness()
    setReviewCycleServiceForTesting(harness.reviewCycleService)
    setEvaluationResponseServiceForTesting(harness.evaluationResponseService)
    setCycleAggregationServiceForTesting(harness.aggregationService)
    setAICoachServiceForTesting(harness.aiCoachService)
    setFeedbackServiceForTesting(harness.feedbackService)

    setSession(makeHrSession('hr-manager-1'))
    const createRes = await createCyclePOST(
      new NextRequest('http://localhost/api/evaluation/cycles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makeCycleBody({ name: 'Hold Check Cycle' })),
      }),
    )
    const createdJson = await createRes.json()
    const cycleId = createdJson.data.id as string

    await activateCyclePOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/activate`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )

    setSession(makeEmployeeSession('subject-1'))
    await submitResponsePOST(
      new NextRequest('http://localhost/api/evaluation/responses/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeSubmitBody('subject-1', 'SELF', 80, '自己評価コメント'),
          cycleId,
        }),
      }),
    )

    setSession(makeEmployeeSession('peer-1'))
    await submitResponsePOST(
      new NextRequest('http://localhost/api/evaluation/responses/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeSubmitBody('subject-1', 'PEER', 85, '一人目のピア評価コメント'),
          cycleId,
        }),
      }),
    )

    setSession(makeHrSession('hr-manager-1'))
    await aggregateCyclePOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/aggregate`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )

    const aggregateRunRes = await runAggregationPOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/run-aggregation`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(aggregateRunRes.status).toBe(200)
    const aggregateJson = await aggregateRunRes.json()
    expect(aggregateJson.data.minimumNotMetCount).toBe(1)
    expect(aggregateJson.data.results[0].minimumNotMet).toBe(true)

    const pendingApprovalRes = await pendingApprovalPOST(
      new NextRequest(`http://localhost/api/evaluation/cycles/${cycleId}/pending-approval`, {
        method: 'POST',
      }),
      makeRouteContext(cycleId),
    )
    expect(pendingApprovalRes.status).toBe(409)

    const previewRes = await previewFeedbackGET(
      new NextRequest(
        `http://localhost/api/feedback/preview?cycleId=${cycleId}&subjectId=subject-1`,
      ),
    )
    expect(previewRes.status).toBe(404)
  })
})
