import type { FailureRateSummary } from '@/lib/ai-monitoring/ai-usage-types'
import type { SecuritySummary } from './security-monitoring-service'

export interface AccessLogMetricRecord {
  readonly statusCode: number
  readonly requestedAt: Date
}

export interface AccessLogMetricsPort {
  listByDateRange(period: {
    readonly from: Date
    readonly to: Date
  }): Promise<readonly AccessLogMetricRecord[]>
}

export interface OperationsSnapshot {
  readonly apiErrors: {
    readonly totalRequests: number
    readonly errorCount: number
    readonly errorRate: number
  }
  readonly aiFailures: FailureRateSummary
  readonly security: SecuritySummary
}

export interface OperationsDashboardService {
  getSnapshot(period: { readonly from: Date; readonly to: Date }): Promise<OperationsSnapshot>
}

interface CreateOperationsDashboardServiceOptions {
  readonly accessLogs: AccessLogMetricsPort
  readonly aiMonitoring: {
    getFailureRate(period: { readonly from: Date; readonly to: Date }): Promise<FailureRateSummary>
  }
  readonly securityMonitoring: {
    getSummary(period: { readonly from: Date; readonly to: Date }): Promise<SecuritySummary>
  }
}

export function createOperationsDashboardService(
  options: CreateOperationsDashboardServiceOptions,
): OperationsDashboardService {
  return {
    async getSnapshot(period): Promise<OperationsSnapshot> {
      const [requests, aiFailures, security] = await Promise.all([
        options.accessLogs.listByDateRange(period),
        options.aiMonitoring.getFailureRate(period),
        options.securityMonitoring.getSummary(period),
      ])
      const errorCount = requests.filter((request) => request.statusCode >= 500).length
      const totalRequests = requests.length

      return {
        apiErrors: {
          totalRequests,
          errorCount,
          errorRate: totalRequests === 0 ? 0 : errorCount / totalRequests,
        },
        aiFailures,
        security,
      }
    },
  }
}
