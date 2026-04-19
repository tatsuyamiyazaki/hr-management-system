import { z } from 'zod'

// イベント名一覧
export const EVALUATION_EVENT_NAMES = [
  'EvaluationSubmitted',
  'CycleFinalized',
  'FeedbackPublished',
] as const
export type EvaluationEventName = (typeof EVALUATION_EVENT_NAMES)[number]

// 各イベントのペイロードスキーマ
export const evaluationEventSchema = {
  EvaluationSubmitted: z.object({
    evaluationId: z.string().min(1),
    evaluatorId: z.string().min(1),
    targetUserId: z.string().min(1),
    submittedAt: z.string().datetime(),
  }),
  CycleFinalized: z.object({
    cycleId: z.string().min(1),
    cycleName: z.string().min(1),
    finalizedAt: z.string().datetime(),
  }),
  FeedbackPublished: z.object({
    feedbackId: z.string().min(1),
    targetUserId: z.string().min(1),
    publishedAt: z.string().datetime(),
  }),
} satisfies Record<EvaluationEventName, z.ZodTypeAny>

export type EvaluationEventPayloadMap = {
  [K in EvaluationEventName]: z.infer<(typeof evaluationEventSchema)[K]>
}

export interface EvaluationEvent<N extends EvaluationEventName = EvaluationEventName> {
  name: N
  payload: EvaluationEventPayloadMap[N]
  publishedAt: string
}
