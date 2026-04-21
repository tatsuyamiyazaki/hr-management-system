export type SecurityEventType = 'AUTH_FAILURE' | 'ACCESS_DENIED' | 'RATE_LIMITED'

export interface SecurityEvent {
  readonly type: SecurityEventType
  readonly occurredAt: Date
  readonly ipAddress?: string
  readonly userId?: string | null
  readonly requestId?: string
  readonly path?: string
  readonly metadata: Record<string, unknown> | null
}

export interface SecurityAlert {
  readonly type: SecurityEventType
  readonly count: number
  readonly threshold: number
  readonly triggeredAt: Date
}

export interface SecuritySummary {
  readonly totalCount: number
  readonly countsByType: Record<SecurityEventType, number>
}

export interface SecurityEventRepository {
  append(event: SecurityEvent): Promise<void>
  listByDateRange(period: {
    readonly from: Date
    readonly to: Date
  }): Promise<readonly SecurityEvent[]>
}

export interface SecurityEventRecorderPort {
  record(event: SecurityEvent): Promise<readonly SecurityAlert[]>
}

export interface SecurityMonitoringService extends SecurityEventRecorderPort {
  getSummary(period: { readonly from: Date; readonly to: Date }): Promise<SecuritySummary>
}

interface CreateSecurityMonitoringServiceOptions {
  readonly repository: SecurityEventRepository
  readonly thresholds?: Partial<Record<SecurityEventType, number>>
  readonly windowMs?: number
}

const DEFAULT_THRESHOLDS: Record<SecurityEventType, number> = {
  AUTH_FAILURE: 5,
  ACCESS_DENIED: 10,
  RATE_LIMITED: 10,
}

const DEFAULT_WINDOW_MS = 15 * 60 * 1000

class InMemorySecurityEventRepository implements SecurityEventRepository {
  private readonly events: SecurityEvent[]

  constructor(seed: readonly SecurityEvent[] = []) {
    this.events = [...seed]
  }

  async append(event: SecurityEvent): Promise<void> {
    this.events.push(event)
  }

  async listByDateRange(period: {
    readonly from: Date
    readonly to: Date
  }): Promise<readonly SecurityEvent[]> {
    return this.events.filter(
      (event) =>
        event.occurredAt.getTime() >= period.from.getTime() &&
        event.occurredAt.getTime() <= period.to.getTime(),
    )
  }
}

function emptyCounts(): Record<SecurityEventType, number> {
  return {
    AUTH_FAILURE: 0,
    ACCESS_DENIED: 0,
    RATE_LIMITED: 0,
  }
}

export function createInMemorySecurityEventRepository(seed?: {
  readonly events?: readonly SecurityEvent[]
}): SecurityEventRepository {
  return new InMemorySecurityEventRepository(seed?.events ?? [])
}

export function createSecurityMonitoringService(
  options: CreateSecurityMonitoringServiceOptions,
): SecurityMonitoringService {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS

  return {
    async record(event): Promise<readonly SecurityAlert[]> {
      await options.repository.append(event)

      const recentEvents = await options.repository.listByDateRange({
        from: new Date(event.occurredAt.getTime() - windowMs),
        to: event.occurredAt,
      })
      const count = recentEvents.filter((candidate) => candidate.type === event.type).length
      const threshold = thresholds[event.type]

      if (count < threshold) {
        return []
      }

      return [
        {
          type: event.type,
          count,
          threshold,
          triggeredAt: event.occurredAt,
        },
      ]
    },

    async getSummary(period): Promise<SecuritySummary> {
      const events = await options.repository.listByDateRange(period)
      const counts = emptyCounts()

      for (const event of events) {
        counts[event.type] += 1
      }

      return {
        totalCount: events.length,
        countsByType: counts,
      }
    },
  }
}
