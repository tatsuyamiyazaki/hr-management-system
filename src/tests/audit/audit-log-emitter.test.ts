import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditLogEmitter, createAuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditAction, AuditResourceType, AuditLogEntry } from '@/lib/audit/audit-log-types'

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn()

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    auditLog: {
      create: mockCreate,
    },
  })),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AuditLogEmitter', () => {
  let emitter: AuditLogEmitter

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 'audit-1' })
    emitter = createAuditLogEmitter()
  })

  describe('emit()', () => {
    it('should emit an audit log entry with all required fields', async () => {
      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'LOGIN_SUCCESS' as AuditAction,
        resourceType: 'USER' as AuditResourceType,
        resourceId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        before: null,
        after: null,
      }

      await emitter.emit(entry)

      expect(mockCreate).toHaveBeenCalledOnce()
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'LOGIN_SUCCESS',
          resourceType: 'USER',
          resourceId: 'user-1',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          before: null,
          after: null,
        }),
      })
    })

    it('should include before/after diff when provided', async () => {
      const before = { role: 'EMPLOYEE' }
      const after = { role: 'MANAGER' }

      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'ROLE_CHANGE' as AuditAction,
        resourceType: 'USER' as AuditResourceType,
        resourceId: 'user-2',
        ipAddress: '10.0.0.1',
        userAgent: 'TestAgent/1.0',
        before,
        after,
      }

      await emitter.emit(entry)

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          before,
          after,
        }),
      })
    })

    it('should not throw when emit fails (fire-and-forget pattern)', async () => {
      mockCreate.mockRejectedValue(new Error('DB connection failed'))

      const entry: AuditLogEntry = {
        userId: 'user-1',
        action: 'LOGOUT' as AuditAction,
        resourceType: 'SESSION' as AuditResourceType,
        resourceId: 'session-1',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        before: null,
        after: null,
      }

      // Should not throw — fire-and-forget
      await expect(emitter.emit(entry)).resolves.not.toThrow()
    })

    it('should accept null userId for unauthenticated actions', async () => {
      const entry: AuditLogEntry = {
        userId: null,
        action: 'LOGIN_FAILURE' as AuditAction,
        resourceType: 'USER' as AuditResourceType,
        resourceId: null,
        ipAddress: '1.2.3.4',
        userAgent: 'AttackerBot/1.0',
        before: null,
        after: null,
      }

      await emitter.emit(entry)

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          resourceId: null,
        }),
      })
    })
  })
})
