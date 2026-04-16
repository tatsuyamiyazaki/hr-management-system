import { describe, it, expect } from 'vitest'
import {
  importRequestSchema,
  isImportRequest,
  IMPORT_JOB_STATUSES,
  isImportJobStatus,
} from '@/lib/import/import-types'

describe('importRequestSchema', () => {
  describe('MasterCsv バリアント', () => {
    it('should accept valid MasterCsv payload', () => {
      const result = importRequestSchema.safeParse({ type: 'MasterCsv', resource: 'DEPARTMENT' })
      expect(result.success).toBe(true)
    })

    it('should reject MasterCsv without resource', () => {
      const result = importRequestSchema.safeParse({ type: 'MasterCsv' })
      expect(result.success).toBe(false)
    })

    it('should reject MasterCsv with empty resource', () => {
      const result = importRequestSchema.safeParse({ type: 'MasterCsv', resource: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('EmployeeCsv バリアント', () => {
    it('should accept valid EmployeeCsv payload', () => {
      const result = importRequestSchema.safeParse({ type: 'EmployeeCsv' })
      expect(result.success).toBe(true)
    })
  })

  it('should reject unknown type', () => {
    const result = importRequestSchema.safeParse({ type: 'UnknownType' })
    expect(result.success).toBe(false)
  })
})

describe('isImportRequest()', () => {
  it('should return true for valid MasterCsv', () => {
    expect(isImportRequest({ type: 'MasterCsv', resource: 'POSITION' })).toBe(true)
  })

  it('should return true for valid EmployeeCsv', () => {
    expect(isImportRequest({ type: 'EmployeeCsv' })).toBe(true)
  })

  it('should return false for null', () => {
    expect(isImportRequest(null)).toBe(false)
  })

  it('should return false for unknown type', () => {
    expect(isImportRequest({ type: 'Unknown' })).toBe(false)
  })
})

describe('IMPORT_JOB_STATUSES', () => {
  it('should contain the four expected statuses', () => {
    expect(IMPORT_JOB_STATUSES).toContain('queued')
    expect(IMPORT_JOB_STATUSES).toContain('processing')
    expect(IMPORT_JOB_STATUSES).toContain('ready')
    expect(IMPORT_JOB_STATUSES).toContain('failed')
  })
})

describe('isImportJobStatus()', () => {
  it('should return true for valid statuses', () => {
    expect(isImportJobStatus('queued')).toBe(true)
    expect(isImportJobStatus('processing')).toBe(true)
    expect(isImportJobStatus('ready')).toBe(true)
    expect(isImportJobStatus('failed')).toBe(true)
  })

  it('should return false for invalid status', () => {
    expect(isImportJobStatus('unknown-status')).toBe(false)
  })

  it('should return false for non-string', () => {
    expect(isImportJobStatus(42)).toBe(false)
  })
})
