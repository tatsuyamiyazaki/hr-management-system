import { describe, it, expect, vi } from 'vitest'

import type { AuditLoggerPort } from '@/lib/rbac/authorizer'
import {
  createRouteGuard,
  matchRoutePolicy,
  type RoutePolicy,
  type SubjectProvider,
} from '@/lib/rbac/next-middleware'
import type { AuthSubject } from '@/lib/rbac/rbac-types'
import type { UserRole } from '@/lib/notification/notification-types'

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

function makeSubjectProvider(value: AuthSubject | null): SubjectProvider {
  return {
    getSubject: vi.fn(async () => value),
  }
}

function req(pathname: string): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: { 'x-forwarded-for': '10.0.0.9', 'user-agent': 'jest-test' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// matchRoutePolicy()
// ─────────────────────────────────────────────────────────────────────────────

describe('matchRoutePolicy()', () => {
  const policies: readonly RoutePolicy[] = [
    { pathPattern: /^\/admin(\/.*)?$/, allowedRoles: ['ADMIN'], resourceType: 'SYSTEM_CONFIG' },
    { pathPattern: /^\/hr(\/.*)?$/, allowedRoles: ['ADMIN', 'HR_MANAGER'] },
    { pathPattern: /^\/.*$/, allowedRoles: ['ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  ]

  it('returns the first matching policy', () => {
    const policy = matchRoutePolicy('/admin/users', policies)
    expect(policy?.allowedRoles).toEqual(['ADMIN'])
    expect(policy?.resourceType).toBe('SYSTEM_CONFIG')
  })

  it('returns a later policy when earlier ones do not match', () => {
    const policy = matchRoutePolicy('/hr/employees', policies)
    expect(policy?.allowedRoles).toEqual(['ADMIN', 'HR_MANAGER'])
  })

  it('returns null when no policy matches', () => {
    const emptyPolicies: readonly RoutePolicy[] = [
      { pathPattern: /^\/admin(\/.*)?$/, allowedRoles: ['ADMIN'] },
    ]
    expect(matchRoutePolicy('/public/home', emptyPolicies)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createRouteGuard().guard()
// ─────────────────────────────────────────────────────────────────────────────

describe('createRouteGuard().guard()', () => {
  const policies: readonly RoutePolicy[] = [
    { pathPattern: /^\/admin(\/.*)?$/, allowedRoles: ['ADMIN'], resourceType: 'SYSTEM_CONFIG' },
  ]

  it('returns null when no policy matches (unprotected path)', async () => {
    const subjectProvider = makeSubjectProvider(subject('e-1', 'EMPLOYEE'))
    const audit = makeAuditSpy()
    const { guard } = createRouteGuard({ policies, subjectProvider, auditLogger: audit })
    const result = await guard(req('/public/home'))
    expect(result).toBeNull()
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('returns 401 when subjectProvider yields null on a protected path', async () => {
    const subjectProvider = makeSubjectProvider(null)
    const audit = makeAuditSpy()
    const { guard } = createRouteGuard({ policies, subjectProvider, auditLogger: audit })
    const result = await guard(req('/admin/settings'))
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(401)
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('returns null when subject role is allowed', async () => {
    const subjectProvider = makeSubjectProvider(subject('a-1', 'ADMIN'))
    const audit = makeAuditSpy()
    const { guard } = createRouteGuard({ policies, subjectProvider, auditLogger: audit })
    const result = await guard(req('/admin/users'))
    expect(result).toBeNull()
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('returns 403 and emits ACCESS_DENIED when subject role is not allowed', async () => {
    const subjectProvider = makeSubjectProvider(subject('e-1', 'EMPLOYEE'))
    const audit = makeAuditSpy()
    const { guard } = createRouteGuard({ policies, subjectProvider, auditLogger: audit })
    const result = await guard(req('/admin/users'))
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(403)

    expect(audit.emit).toHaveBeenCalledTimes(1)
    const entry = audit.emit.mock.calls[0]?.[0]
    expect(entry).toMatchObject({
      userId: 'e-1',
      action: 'ACCESS_DENIED',
      resourceType: 'SYSTEM_CONFIG',
    })
    expect(entry?.after).toMatchObject({
      reason: 'DENIED_INSUFFICIENT_ROLE',
      subjectRole: 'EMPLOYEE',
    })
  })

  it('uses ROUTE as fallback resourceType when policy has no resourceType', async () => {
    const noTypePolicies: readonly RoutePolicy[] = [
      { pathPattern: /^\/secret$/, allowedRoles: ['ADMIN'] },
    ]
    const subjectProvider = makeSubjectProvider(subject('e-1', 'EMPLOYEE'))
    const audit = makeAuditSpy()
    const { guard } = createRouteGuard({
      policies: noTypePolicies,
      subjectProvider,
      auditLogger: audit,
    })
    const result = await guard(req('/secret'))
    expect(result?.status).toBe(403)
    const entry = audit.emit.mock.calls[0]?.[0]
    expect(entry?.resourceType).toBe('ROUTE')
  })

  it('returns 403 even when no auditLogger is injected', async () => {
    const subjectProvider = makeSubjectProvider(subject('e-1', 'EMPLOYEE'))
    const { guard } = createRouteGuard({ policies, subjectProvider })
    const result = await guard(req('/admin/users'))
    expect(result?.status).toBe(403)
  })
})
