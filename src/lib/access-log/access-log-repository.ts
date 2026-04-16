import { PrismaClient } from '@prisma/client'
import type { AccessLogEntry, AccessLogQuery } from './access-log-types'

export interface AccessLogRepository {
  insert(entry: AccessLogEntry): Promise<void>
  findMany(query: AccessLogQuery): Promise<{ data: AccessLogRecord[]; total: number }>
}

export interface AccessLogRecord {
  id: string
  method: string
  path: string
  statusCode: number
  durationMs: number
  ipAddress: string
  userAgent: string
  userId: string | null
  requestId: string
  requestedAt: Date
}

class PrismaAccessLogRepository implements AccessLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async insert(entry: AccessLogEntry): Promise<void> {
    await this.db.accessLog.create({
      data: {
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        userId: entry.userId,
        requestId: entry.requestId,
      },
    })
  }

  async findMany(query: AccessLogQuery): Promise<{ data: AccessLogRecord[]; total: number }> {
    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.path ? { path: { contains: query.path } } : {}),
      ...(query.statusCode ? { statusCode: query.statusCode } : {}),
      ...(query.from || query.to
        ? {
            requestedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      this.db.accessLog.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.accessLog.count({ where }),
    ])

    return { data, total }
  }
}

export function createAccessLogRepository(db?: PrismaClient): AccessLogRepository {
  return new PrismaAccessLogRepository(db ?? new PrismaClient())
}
