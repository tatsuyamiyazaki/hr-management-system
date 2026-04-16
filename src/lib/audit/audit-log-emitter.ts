import { Prisma, PrismaClient } from '@prisma/client'
import type { AuditLogEntry } from './audit-log-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogEmitter {
  /**
   * Emit an audit log entry asynchronously (fire-and-forget).
   * This method NEVER throws — failures are silently swallowed to prevent
   * audit logging from disrupting the main request flow.
   */
  emit(entry: AuditLogEntry): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class PrismaAuditLogEmitter implements AuditLogEmitter {
  private readonly db: PrismaClient

  constructor(db: PrismaClient) {
    this.db = db
  }

  async emit(entry: AuditLogEntry): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          before: entry.before != null ? (entry.before as Prisma.InputJsonValue) : undefined,
          after: entry.after != null ? (entry.after as Prisma.InputJsonValue) : undefined,
        },
      })
    } catch {
      // Fire-and-forget: log the failure but do not rethrow.
      // Audit logging must never disrupt the primary request flow.
      // In production, consider piping this to a structured logger or DLQ.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new AuditLogEmitter backed by Prisma.
 * Pass an existing PrismaClient for testing or shared-connection scenarios.
 */
export function createAuditLogEmitter(db?: PrismaClient): AuditLogEmitter {
  return new PrismaAuditLogEmitter(db ?? new PrismaClient())
}
