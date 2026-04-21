import { describe, it, expect, vi } from 'vitest'

import type { AuditLoggerPort } from '@/lib/rbac/authorizer'
import { requireRole } from '@/lib/rbac/require-role'
import { ForbiddenError, type AuthSubject } from '@/lib/rbac/rbac-types'
import type { UserRole } from '@/lib/notification/notification-types'
import type { SecurityEventRecorderPort } from '@/lib/monitoring/security-monitoring-service'

function subject(userId: string, role: UserRole): AuthSubject {
  return { userId, role }
}

interface AuditSpy extends AuditLoggerPort {
  readonly emit: ReturnType<typeof vi.fn>
}

function makeAuditSpy(): AuditSpy {
  const emit = vi.fn(async () => {})
  return { emit } as AuditSpy
}

function makeSecuritySpy(): SecurityEventRecorderPort & {
  readonly record: ReturnType<typeof vi.fn>
} {
  const record = vi.fn(async () => [])
  return { record }
}

describe('requireRole()', () => {
  it('resolves silently when subject role is in allowedRoles', async () => {
    const audit = makeAuditSpy()
    await expect(
      requireRole(subject('a-1', 'ADMIN'), ['ADMIN', 'HR_MANAGER'], {
        auditLogger: audit,
      }),
    ).resolves.toBeUndefined()
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError when subject role is not in allowedRoles', async () => {
    const audit = makeAuditSpy()
    const securityMonitor = makeSecuritySpy()
    await expect(
      requireRole(subject('e-1', 'EMPLOYEE'), ['ADMIN', 'HR_MANAGER'], {
        resourceHint: { type: 'EVALUATION', id: 'e1' },
        context: { ipAddress: '10.0.0.1', userAgent: 'Mozilla/5.0' },
        auditLogger: audit,
        securityMonitor,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)

    expect(audit.emit).toHaveBeenCalledTimes(1)
    const entry = audit.emit.mock.calls[0]?.[0]
    expect(entry).toMatchObject({
      userId: 'e-1',
      action: 'ACCESS_DENIED',
      resourceType: 'EVALUATION',
      resourceId: 'e1',
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
    })
    expect(entry?.after).toMatchObject({
      reason: 'DENIED_INSUFFICIENT_ROLE',
      subjectRole: 'EMPLOYEE',
    })
    expect(securityMonitor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ACCESS_DENIED',
        userId: 'e-1',
        ipAddress: '10.0.0.1',
      }),
    )
  })

  it('works without resourceHint (defaults resourceType / resourceId)', async () => {
    const audit = makeAuditSpy()
    await expect(
      requireRole(subject('e-1', 'EMPLOYEE'), ['ADMIN'], { auditLogger: audit }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    const entry = audit.emit.mock.calls[0]?.[0]
    expect(entry?.resourceType).toBe('ROUTE')
    expect(entry?.resourceId).toBeNull()
  })

  it('works without auditLogger (still throws ForbiddenError)', async () => {
    await expect(requireRole(subject('e-1', 'EMPLOYEE'), ['ADMIN'])).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('accepts a single-role allowedRoles list', async () => {
    await expect(
      requireRole(subject('hr-1', 'HR_MANAGER'), ['HR_MANAGER']),
    ).resolves.toBeUndefined()
  })
})
