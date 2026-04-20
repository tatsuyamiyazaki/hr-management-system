/**
 * Issue #66 / Task 19.1: Total evaluation BullMQ worker tests.
 */
import { describe, it, expect, vi } from 'vitest'
import { processTotalEvaluationCalculationJob } from '@/lib/total-evaluation/total-evaluation-worker'
import type { TotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-types'

function makeJob(data: unknown) {
  return {
    id: 'job-1',
    data,
  }
}

describe('processTotalEvaluationCalculationJob', () => {
  it('payloadのcycleId/subjectIdを使って社員単位の再計算を行う', async () => {
    const service: Pick<TotalEvaluationService, 'calculateSubject'> = {
      calculateSubject: vi.fn().mockResolvedValue({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        finalScore: 80,
      }),
    }

    const result = await processTotalEvaluationCalculationJob(
      makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' }) as never,
      { service: service as TotalEvaluationService },
    )

    expect(service.calculateSubject).toHaveBeenCalledWith('cycle-1', 'user-1')
    expect(result).toEqual({ cycleId: 'cycle-1', subjectId: 'user-1', finalScore: 80 })
  })

  it('不正payloadはエラーにする', async () => {
    const service: Pick<TotalEvaluationService, 'calculateSubject'> = {
      calculateSubject: vi.fn(),
    }

    await expect(
      processTotalEvaluationCalculationJob(makeJob({ cycleId: 'cycle-1' }) as never, {
        service: service as TotalEvaluationService,
      }),
    ).rejects.toThrow('TotalEvaluationWorker: invalid payload')
    expect(service.calculateSubject).not.toHaveBeenCalled()
  })
})
