import { describe, it, expect } from 'vitest'
import {
  isExportRequest,
  isExportJobStatus,
  exportRequestSchema,
  EXPORT_JOB_STATUSES,
} from '@/lib/export/export-types'

describe('isExportJobStatus()', () => {
  it('should return true for valid statuses', () => {
    for (const s of EXPORT_JOB_STATUSES) {
      expect(isExportJobStatus(s)).toBe(true)
    }
  })

  it('should return false for invalid values', () => {
    expect(isExportJobStatus('unknown')).toBe(false)
    expect(isExportJobStatus(null)).toBe(false)
    expect(isExportJobStatus(42)).toBe(false)
  })
})

describe('isExportRequest()', () => {
  it('should return true for MasterCsv request', () => {
    expect(isExportRequest({ type: 'MasterCsv', resource: 'DEPARTMENT' })).toBe(true)
  })

  it('should return true for OrganizationCsv request', () => {
    expect(isExportRequest({ type: 'OrganizationCsv' })).toBe(true)
  })

  it('should return true for EvaluationReport request', () => {
    expect(
      isExportRequest({ type: 'EvaluationReport', cycleId: 'cycle-1', format: 'pdf' }),
    ).toBe(true)
  })

  it('should return true for AuditLog request', () => {
    expect(isExportRequest({ type: 'AuditLog', filter: {} })).toBe(true)
  })

  it('should return false for unknown type', () => {
    expect(isExportRequest({ type: 'Unknown' })).toBe(false)
    expect(isExportRequest(null)).toBe(false)
    expect(isExportRequest('string')).toBe(false)
  })
})

describe('exportRequestSchema', () => {
  it('should validate MasterCsv variant', () => {
    const result = exportRequestSchema.safeParse({ type: 'MasterCsv', resource: 'DEPARTMENT' })
    expect(result.success).toBe(true)
  })

  it('should validate OrganizationCsv variant', () => {
    const result = exportRequestSchema.safeParse({ type: 'OrganizationCsv' })
    expect(result.success).toBe(true)
  })

  it('should validate EvaluationReport with pdf format', () => {
    const result = exportRequestSchema.safeParse({
      type: 'EvaluationReport',
      cycleId: 'cycle-1',
      format: 'pdf',
    })
    expect(result.success).toBe(true)
  })

  it('should validate EvaluationReport with csv format', () => {
    const result = exportRequestSchema.safeParse({
      type: 'EvaluationReport',
      cycleId: 'cycle-1',
      format: 'csv',
    })
    expect(result.success).toBe(true)
  })

  it('should validate AuditLog variant', () => {
    const result = exportRequestSchema.safeParse({ type: 'AuditLog', filter: { userId: 'u-1' } })
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const result = exportRequestSchema.safeParse({ type: 'MasterCsv' })
    expect(result.success).toBe(false)
  })

  it('should reject invalid type', () => {
    const result = exportRequestSchema.safeParse({ type: 'InvalidType' })
    expect(result.success).toBe(false)
  })
})
