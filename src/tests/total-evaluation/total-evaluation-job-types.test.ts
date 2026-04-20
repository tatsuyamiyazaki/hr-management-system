/**
 * Issue #66 / Task 19.1: total-evaluation job payload schema tests.
 */
import { describe, it, expect } from 'vitest'
import { isJobName, jobPayloadSchema } from '@/lib/jobs/job-types'

describe('total-evaluation-calculate job type', () => {
  it('JobNameとして登録され、cycleId/subjectIdを検証する', () => {
    expect(isJobName('total-evaluation-calculate')).toBe(true)

    expect(() =>
      jobPayloadSchema['total-evaluation-calculate'].parse({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
      }),
    ).not.toThrow()
    expect(() =>
      jobPayloadSchema['total-evaluation-calculate'].parse({
        cycleId: 'cycle-1',
      }),
    ).toThrow()
  })
})
