import type { Job } from 'bullmq'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type {
  TotalEvaluationCalculationPayload,
  TotalEvaluationResult,
  TotalEvaluationService,
} from './total-evaluation-types'
import { totalEvaluationCalculationPayloadSchema } from './total-evaluation-types'

export interface TotalEvaluationWorkerDeps {
  readonly service: TotalEvaluationService
}

function parsePayload(value: unknown): TotalEvaluationCalculationPayload | null {
  const parsed = totalEvaluationCalculationPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export async function processTotalEvaluationCalculationJob(
  job: Job,
  deps: TotalEvaluationWorkerDeps,
): Promise<TotalEvaluationResult> {
  const payload = parsePayload(job.data)

  if (!payload) {
    throw new Error(`TotalEvaluationWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  return deps.service.calculateSubject(payload.cycleId, payload.subjectId)
}

export function createTotalEvaluationWorker(deps: TotalEvaluationWorkerDeps) {
  return createBaseWorker('total-evaluation-calculate', (job) =>
    processTotalEvaluationCalculationJob(job, deps),
  )
}
