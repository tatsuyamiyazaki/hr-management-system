import { describe, it, expect } from 'vitest'
import { JOB_NAMES, isJobName, jobPayloadSchema } from '@/lib/jobs/job-types'

describe('JOB_NAMES', () => {
  it('should include email sending job', () => {
    expect(JOB_NAMES).toContain('send-email')
  })

  it('should include csv export job', () => {
    expect(JOB_NAMES).toContain('export-csv')
  })

  it('should include csv import job', () => {
    expect(JOB_NAMES).toContain('import-csv')
  })
})

describe('isJobName()', () => {
  it('should return true for valid job names', () => {
    expect(isJobName('send-email')).toBe(true)
    expect(isJobName('export-csv')).toBe(true)
  })

  it('should return false for unknown names', () => {
    expect(isJobName('unknown-job')).toBe(false)
    expect(isJobName('')).toBe(false)
    expect(isJobName(null)).toBe(false)
  })
})

describe('jobPayloadSchema', () => {
  it('should validate send-email payload', () => {
    const result = jobPayloadSchema['send-email'].safeParse({
      to: 'user@example.com',
      subject: 'Hello',
      body: 'World',
    })
    expect(result.success).toBe(true)
  })

  it('should reject send-email payload with invalid email', () => {
    const result = jobPayloadSchema['send-email'].safeParse({
      to: 'not-an-email',
      subject: 'Hello',
      body: 'World',
    })
    expect(result.success).toBe(false)
  })

  it('should validate export-csv payload', () => {
    const result = jobPayloadSchema['export-csv'].safeParse({
      resourceType: 'USER',
      requestedBy: 'user-1',
    })
    expect(result.success).toBe(true)
  })

  it('should validate import-csv payload', () => {
    const result = jobPayloadSchema['import-csv'].safeParse({
      resourceType: 'USER',
      fileUrl: 'https://storage.example.com/upload.csv',
      requestedBy: 'user-1',
    })
    expect(result.success).toBe(true)
  })
})
