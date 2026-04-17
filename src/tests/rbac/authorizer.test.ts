import { describe, it, expect, vi } from 'vitest'

import { createAuthorizer, type AuditLoggerPort } from '@/lib/rbac/authorizer'
import { DEFAULT_POLICY_RULES } from '@/lib/rbac/policy'
import {
  ForbiddenError,
  type Action,
  type AuthSubject,
  type PolicyRule,
  type ResourceRef,
} from '@/lib/rbac/rbac-types'
import type { UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function subject(userId: string, role: UserRole): AuthSubject {
  return { userId, role }
}

function resource(type: string, id: string, ownerId?: string): ResourceRef {
  return { type, id, ownerId }
}

interface AuditSpy extends AuditLoggerPort {
  readonly emit: ReturnType<typeof vi.fn>
}

function makeAuditSpy(): AuditSpy {
  const emit = vi.fn(async () => {})
  return { emit } as AuditSpy
}

// ─────────────────────────────────────────────────────────────────────────────
// decide() — デフォルトポリシー
// ─────────────────────────────────────────────────────────────────────────────

describe('Authorizer.decide() with DEFAULT_POLICY_RULES', () => {
  const authz = createAuthorizer({})

  // --- ADMIN is allowed across the board ---
  it.each<[Action]>([['READ'], ['UPDATE'], ['DELETE']])(
    'ADMIN is allowed for EVALUATION %s',
    (action) => {
      const d = authz.decide(subject('admin-1', 'ADMIN'), action, resource('EVALUATION', 'e1'))
      expect(d.allowed).toBe(true)
      expect(d.reason).toBe('ALLOWED_BY_ROLE')
    },
  )

  it('ADMIN is allowed for AUDIT_LOG READ', () => {
    const d = authz.decide(subject('a1', 'ADMIN'), 'READ', resource('AUDIT_LOG', 'l1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_BY_ROLE')
  })

  it('ADMIN is allowed for SYSTEM_CONFIG MANAGE', () => {
    const d = authz.decide(subject('a1', 'ADMIN'), 'MANAGE', resource('SYSTEM_CONFIG', 's1'))
    expect(d.allowed).toBe(true)
  })

  // --- HR_MANAGER ---
  it('HR_MANAGER can READ any EVALUATION', () => {
    const d = authz.decide(
      subject('hr-1', 'HR_MANAGER'),
      'READ',
      resource('EVALUATION', 'e1', 'someone-else'),
    )
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_BY_ROLE')
  })

  it('HR_MANAGER can UPDATE any EVALUATION', () => {
    const d = authz.decide(
      subject('hr-1', 'HR_MANAGER'),
      'UPDATE',
      resource('EVALUATION', 'e1', 'someone-else'),
    )
    expect(d.allowed).toBe(true)
  })

  it('HR_MANAGER cannot DELETE EVALUATION (ADMIN only)', () => {
    const d = authz.decide(subject('hr-1', 'HR_MANAGER'), 'DELETE', resource('EVALUATION', 'e1'))
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_INSUFFICIENT_ROLE')
  })

  it('HR_MANAGER cannot READ AUDIT_LOG', () => {
    const d = authz.decide(subject('hr-1', 'HR_MANAGER'), 'READ', resource('AUDIT_LOG', 'l1'))
    expect(d.allowed).toBe(false)
  })

  // --- MANAGER ---
  it('MANAGER can READ their own EVALUATION (as owner)', () => {
    const d = authz.decide(subject('m-1', 'MANAGER'), 'READ', resource('EVALUATION', 'e1', 'm-1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_AS_OWNER')
  })

  it('MANAGER cannot UPDATE another employee EVALUATION', () => {
    const d = authz.decide(
      subject('m-1', 'MANAGER'),
      'UPDATE',
      resource('EVALUATION', 'e1', 'someone-else'),
    )
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_NOT_OWNER')
  })

  it('MANAGER can READ PROFILE as allowed role', () => {
    const d = authz.decide(
      subject('m-1', 'MANAGER'),
      'READ',
      resource('PROFILE', 'p1', 'someone-else'),
    )
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_BY_ROLE')
  })

  // --- EMPLOYEE ---
  it('EMPLOYEE can CREATE EVALUATION', () => {
    const d = authz.decide(subject('e-1', 'EMPLOYEE'), 'CREATE', resource('EVALUATION', 'e1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_BY_ROLE')
  })

  it('EMPLOYEE cannot READ another employee EVALUATION (Req 1.9)', () => {
    const d = authz.decide(
      subject('e-1', 'EMPLOYEE'),
      'READ',
      resource('EVALUATION', 'e1', 'other-employee'),
    )
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_NOT_OWNER')
  })

  it('EMPLOYEE can READ their own EVALUATION (as owner)', () => {
    const d = authz.decide(subject('e-1', 'EMPLOYEE'), 'READ', resource('EVALUATION', 'e1', 'e-1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_AS_OWNER')
  })

  it('EMPLOYEE can UPDATE their own GOAL (as owner)', () => {
    const d = authz.decide(subject('e-1', 'EMPLOYEE'), 'UPDATE', resource('GOAL', 'g1', 'e-1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_AS_OWNER')
  })

  it('EMPLOYEE cannot UPDATE another employee GOAL', () => {
    const d = authz.decide(
      subject('e-1', 'EMPLOYEE'),
      'UPDATE',
      resource('GOAL', 'g1', 'other-employee'),
    )
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_NOT_OWNER')
  })

  it('EMPLOYEE cannot READ AUDIT_LOG', () => {
    const d = authz.decide(subject('e-1', 'EMPLOYEE'), 'READ', resource('AUDIT_LOG', 'l1'))
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_INSUFFICIENT_ROLE')
  })

  // --- No matching rule ---
  it('returns DENIED_NO_RULE when no matching rule exists', () => {
    const d = authz.decide(subject('a-1', 'ADMIN'), 'READ', resource('UNKNOWN_RESOURCE', 'x'))
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_NO_RULE')
  })

  // --- ownerCanAccess without ownerId ---
  it('falls back to DENIED_INSUFFICIENT_ROLE when ownerCanAccess rule has no ownerId', () => {
    const d = authz.decide(
      subject('e-1', 'EMPLOYEE'),
      'READ',
      resource('EVALUATION', 'e1'), // ownerId undefined
    )
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_INSUFFICIENT_ROLE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// decide() — カスタムルール注入
// ─────────────────────────────────────────────────────────────────────────────

describe('Authorizer.decide() with custom rules', () => {
  it('uses injected rules instead of defaults', () => {
    const customRules: readonly PolicyRule[] = [
      { resourceType: 'WIDGET', action: 'READ', allowedRoles: ['EMPLOYEE'] },
    ]
    const authz = createAuthorizer({ rules: customRules })
    const d = authz.decide(subject('e-1', 'EMPLOYEE'), 'READ', resource('WIDGET', 'w1'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('ALLOWED_BY_ROLE')
  })

  it('EVALUATION rules are absent when custom rules override', () => {
    const customRules: readonly PolicyRule[] = [
      { resourceType: 'WIDGET', action: 'READ', allowedRoles: ['ADMIN'] },
    ]
    const authz = createAuthorizer({ rules: customRules })
    const d = authz.decide(subject('a-1', 'ADMIN'), 'READ', resource('EVALUATION', 'e1'))
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('DENIED_NO_RULE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// enforce()
// ─────────────────────────────────────────────────────────────────────────────

describe('Authorizer.enforce()', () => {
  it('resolves silently when decide returns allowed=true', async () => {
    const audit = makeAuditSpy()
    const authz = createAuthorizer({ auditLogger: audit })
    await expect(
      authz.enforce(subject('a-1', 'ADMIN'), 'READ', resource('EVALUATION', 'e1')),
    ).resolves.toBeUndefined()
    expect(audit.emit).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError and emits ACCESS_DENIED when denied', async () => {
    const audit = makeAuditSpy()
    const authz = createAuthorizer({ auditLogger: audit })
    await expect(
      authz.enforce(
        subject('e-1', 'EMPLOYEE'),
        'READ',
        resource('EVALUATION', 'e1', 'other-employee'),
        { ipAddress: '10.0.0.1', userAgent: 'Mozilla/5.0' },
      ),
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
      before: null,
    })
    expect(entry?.after).toMatchObject({
      reason: 'DENIED_NOT_OWNER',
      requestedAction: 'READ',
      subjectRole: 'EMPLOYEE',
    })
  })

  it('uses empty strings for ipAddress / userAgent when context omitted', async () => {
    const audit = makeAuditSpy()
    const authz = createAuthorizer({ auditLogger: audit })
    await expect(
      authz.enforce(subject('e-1', 'EMPLOYEE'), 'DELETE', resource('EVALUATION', 'e1', 'e-1')),
    ).rejects.toBeInstanceOf(ForbiddenError)
    const entry = audit.emit.mock.calls[0]?.[0]
    expect(entry?.ipAddress).toBe('')
    expect(entry?.userAgent).toBe('')
  })

  it('still throws ForbiddenError when no auditLogger is injected', async () => {
    const authz = createAuthorizer({})
    await expect(
      authz.enforce(
        subject('e-1', 'EMPLOYEE'),
        'READ',
        resource('EVALUATION', 'e1', 'other-employee'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('records DENIED_NO_RULE when an unknown resource is enforced', async () => {
    const audit = makeAuditSpy()
    const authz = createAuthorizer({ auditLogger: audit })
    await expect(
      authz.enforce(subject('a-1', 'ADMIN'), 'READ', resource('UNKNOWN_X', 'x1')),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(audit.emit.mock.calls[0]?.[0]?.after).toMatchObject({ reason: 'DENIED_NO_RULE' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_POLICY_RULES sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_POLICY_RULES', () => {
  it('exposes EVALUATION/GOAL/POSITION/PROFILE/ONE_ON_ONE/AUDIT_LOG rules', () => {
    const types = new Set(DEFAULT_POLICY_RULES.map((r) => r.resourceType))
    expect(types.has('EVALUATION')).toBe(true)
    expect(types.has('GOAL')).toBe(true)
    expect(types.has('POSITION')).toBe(true)
    expect(types.has('PROFILE')).toBe(true)
    expect(types.has('ONE_ON_ONE')).toBe(true)
    expect(types.has('AUDIT_LOG')).toBe(true)
    expect(types.has('SYSTEM_CONFIG')).toBe(true)
    expect(types.has('MASTER_DATA')).toBe(true)
    expect(types.has('ORGANIZATION')).toBe(true)
  })
})
