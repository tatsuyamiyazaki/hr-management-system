import { describe, expect, it } from 'vitest'

import { createOperationsDashboardService } from '@/lib/monitoring/operations-dashboard-service'

describe('createOperationsDashboardService()', () => {
  it('builds a snapshot with API error rate, AI failure rate, and security counts', async () => {
    const service = createOperationsDashboardService({
      accessLogs: {
        listByDateRange: async () => [
          { statusCode: 200, requestedAt: new Date('2026-04-21T07:00:00.000Z') },
          { statusCode: 502, requestedAt: new Date('2026-04-21T07:01:00.000Z') },
          { statusCode: 500, requestedAt: new Date('2026-04-21T07:02:00.000Z') },
          { statusCode: 404, requestedAt: new Date('2026-04-21T07:03:00.000Z') },
        ],
      },
      aiMonitoring: {
        getFailureRate: async () => ({
          period: {
            from: new Date('2026-04-21T00:00:00.000Z'),
            to: new Date('2026-04-21T23:59:59.999Z'),
          },
          totalAttempts: 20,
          failureCount: 3,
          failureRate: 0.15,
          byErrorCategory: {
            TIMEOUT: 2,
            PROVIDER_ERROR: 1,
          },
        }),
      },
      securityMonitoring: {
        getSummary: async () => ({
          totalCount: 6,
          countsByType: {
            AUTH_FAILURE: 2,
            ACCESS_DENIED: 3,
            RATE_LIMITED: 1,
          },
        }),
      },
    })

    const snapshot = await service.getSnapshot({
      from: new Date('2026-04-21T00:00:00.000Z'),
      to: new Date('2026-04-21T23:59:59.999Z'),
    })

    expect(snapshot.apiErrors).toEqual({
      totalRequests: 4,
      errorCount: 2,
      errorRate: 0.5,
    })
    expect(snapshot.aiFailures.failureRate).toBe(0.15)
    expect(snapshot.security.totalCount).toBe(6)
    expect(snapshot.security.countsByType.ACCESS_DENIED).toBe(3)
  })
})
