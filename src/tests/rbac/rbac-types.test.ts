import { describe, it, expect } from 'vitest'

import { ACTIONS, ForbiddenError, isAction, type Action } from '@/lib/rbac/rbac-types'

describe('ACTIONS', () => {
  it('exposes READ / CREATE / UPDATE / DELETE / MANAGE in that order', () => {
    expect(ACTIONS).toEqual(['READ', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE'])
  })

  it('infers Action as a literal union of the enum members', () => {
    const values: readonly Action[] = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE']
    expect(values).toHaveLength(5)
  })
})

describe('isAction()', () => {
  it('returns true for a valid action literal', () => {
    expect(isAction('READ')).toBe(true)
    expect(isAction('CREATE')).toBe(true)
    expect(isAction('UPDATE')).toBe(true)
    expect(isAction('DELETE')).toBe(true)
    expect(isAction('MANAGE')).toBe(true)
  })

  it('returns false for unknown strings', () => {
    expect(isAction('EXECUTE')).toBe(false)
    expect(isAction('read')).toBe(false)
    expect(isAction('')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isAction(null)).toBe(false)
    expect(isAction(undefined)).toBe(false)
    expect(isAction(1)).toBe(false)
    expect(isAction({})).toBe(false)
  })
})

describe('ForbiddenError', () => {
  it('captures resourceType, action, and reason as readonly fields', () => {
    const err = new ForbiddenError('EVALUATION', 'READ', 'DENIED_INSUFFICIENT_ROLE')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ForbiddenError')
    expect(err.resourceType).toBe('EVALUATION')
    expect(err.action).toBe('READ')
    expect(err.reason).toBe('DENIED_INSUFFICIENT_ROLE')
    expect(err.message).toContain('EVALUATION')
    expect(err.message).toContain('READ')
    expect(err.message).toContain('DENIED_INSUFFICIENT_ROLE')
  })

  it('supports DENIED_NOT_OWNER reason', () => {
    const err = new ForbiddenError('GOAL', 'UPDATE', 'DENIED_NOT_OWNER')
    expect(err.reason).toBe('DENIED_NOT_OWNER')
  })

  it('supports DENIED_NO_RULE reason', () => {
    const err = new ForbiddenError('UNKNOWN', 'READ', 'DENIED_NO_RULE')
    expect(err.reason).toBe('DENIED_NO_RULE')
  })
})
