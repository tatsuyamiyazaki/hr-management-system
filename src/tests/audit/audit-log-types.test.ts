import { describe, it, expect } from 'vitest'
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  isAuditAction,
  isAuditResourceType,
  auditLogEntrySchema,
} from '@/lib/audit/audit-log-types'

describe('AuditAction', () => {
  it('should include authentication events', () => {
    expect(AUDIT_ACTIONS).toContain('LOGIN_SUCCESS')
    expect(AUDIT_ACTIONS).toContain('LOGIN_FAILURE')
    expect(AUDIT_ACTIONS).toContain('LOGOUT')
    expect(AUDIT_ACTIONS).toContain('ACCOUNT_LOCKED')
  })

  it('should include authorization change events', () => {
    expect(AUDIT_ACTIONS).toContain('ROLE_CHANGE')
    expect(AUDIT_ACTIONS).toContain('PERMISSION_CHANGE')
  })

  it('should include data change events', () => {
    expect(AUDIT_ACTIONS).toContain('RECORD_CREATE')
    expect(AUDIT_ACTIONS).toContain('RECORD_UPDATE')
    expect(AUDIT_ACTIONS).toContain('RECORD_DELETE')
  })

  it('should include export events', () => {
    expect(AUDIT_ACTIONS).toContain('DATA_EXPORT')
  })

  it('should include evaluation finalization events', () => {
    expect(AUDIT_ACTIONS).toContain('EVALUATION_FINALIZED')
  })
})

describe('AuditResourceType', () => {
  it('should include core resource types', () => {
    expect(AUDIT_RESOURCE_TYPES).toContain('USER')
    expect(AUDIT_RESOURCE_TYPES).toContain('SESSION')
    expect(AUDIT_RESOURCE_TYPES).toContain('ORGANIZATION')
    expect(AUDIT_RESOURCE_TYPES).toContain('EVALUATION')
    expect(AUDIT_RESOURCE_TYPES).toContain('EXPORT_JOB')
  })
})

describe('isAuditAction()', () => {
  it('should return true for valid audit actions', () => {
    expect(isAuditAction('LOGIN_SUCCESS')).toBe(true)
    expect(isAuditAction('ROLE_CHANGE')).toBe(true)
    expect(isAuditAction('DATA_EXPORT')).toBe(true)
  })

  it('should return false for invalid audit actions', () => {
    expect(isAuditAction('UNKNOWN_ACTION')).toBe(false)
    expect(isAuditAction('')).toBe(false)
    expect(isAuditAction(null)).toBe(false)
  })
})

describe('isAuditResourceType()', () => {
  it('should return true for valid resource types', () => {
    expect(isAuditResourceType('USER')).toBe(true)
    expect(isAuditResourceType('SESSION')).toBe(true)
  })

  it('should return false for invalid resource types', () => {
    expect(isAuditResourceType('UNKNOWN')).toBe(false)
    expect(isAuditResourceType(null)).toBe(false)
  })
})

describe('auditLogEntrySchema', () => {
  it('should validate a correct entry', () => {
    const result = auditLogEntrySchema.safeParse({
      userId: 'user-1',
      action: 'LOGIN_SUCCESS',
      resourceType: 'USER',
      resourceId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      before: null,
      after: null,
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid action', () => {
    const result = auditLogEntrySchema.safeParse({
      userId: 'user-1',
      action: 'INVALID_ACTION',
      resourceType: 'USER',
      resourceId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      before: null,
      after: null,
    })
    expect(result.success).toBe(false)
  })

  it('should accept null userId for unauthenticated events', () => {
    const result = auditLogEntrySchema.safeParse({
      userId: null,
      action: 'LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: null,
      ipAddress: '1.2.3.4',
      userAgent: 'Bot/1.0',
      before: null,
      after: null,
    })
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const result = auditLogEntrySchema.safeParse({
      userId: 'user-1',
      action: 'LOGIN_SUCCESS',
      // missing resourceType, ipAddress, userAgent
    })
    expect(result.success).toBe(false)
  })
})
