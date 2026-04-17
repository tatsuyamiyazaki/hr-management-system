import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// AuditAction
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIT_ACTIONS = [
  // Authentication events (Requirement 17.1)
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'ACCOUNT_LOCKED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_CHANGED',
  // Authorization change events (Requirement 17.2)
  'ROLE_CHANGE',
  'PERMISSION_CHANGE',
  // Organization change events (Requirement 17.2)
  'ORGANIZATION_CHANGE',
  // Master data change events (Requirement 17.2)
  'MASTER_DATA_CHANGE',
  // Generic record CRUD (Requirement 17.2)
  'RECORD_CREATE',
  'RECORD_UPDATE',
  'RECORD_DELETE',
  // Evaluation events (Requirement 17.2)
  'EVALUATION_FINALIZED',
  // Export events (Requirement 17.2)
  'DATA_EXPORT',
  // Custom broadcast notification events (Requirement 15.8)
  'CUSTOM_BROADCAST_SENT',
  // Access denied events (Requirements 1.8, 1.9 / Task 6.3)
  'ACCESS_DENIED',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditResourceType
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIT_RESOURCE_TYPES = [
  'USER',
  'SESSION',
  'ORGANIZATION',
  'POSITION',
  'EVALUATION',
  'EVALUATION_CYCLE',
  'FEEDBACK',
  'GOAL',
  'ONE_ON_ONE',
  'MASTER_DATA',
  'EXPORT_JOB',
  'SYSTEM_CONFIG',
  'NOTIFICATION',
] as const

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number]

export function isAuditResourceType(value: unknown): value is AuditResourceType {
  return typeof value === 'string' && (AUDIT_RESOURCE_TYPES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditLogEntry — validated input for emitting an audit log
// ─────────────────────────────────────────────────────────────────────────────

export const auditLogEntrySchema = z.object({
  /** null for unauthenticated events (e.g. LOGIN_FAILURE before session) */
  userId: z.string().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  resourceType: z.enum(AUDIT_RESOURCE_TYPES),
  /** null when the action is not resource-specific */
  resourceId: z.string().nullable(),
  ipAddress: z.string(),
  userAgent: z.string(),
  /** Snapshot of the record before the change (null when not applicable) */
  before: z.record(z.unknown()).nullable(),
  /** Snapshot of the record after the change (null when not applicable) */
  after: z.record(z.unknown()).nullable(),
})

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
