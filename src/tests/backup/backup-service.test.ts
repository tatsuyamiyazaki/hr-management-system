import { describe, expect, it } from 'vitest'
import { createBackupGovernanceService } from '@/lib/backup/backup-service'

describe('BackupGovernanceService.getPolicy', () => {
  it('returns the required PostgreSQL backup and recovery policy', () => {
    const service = createBackupGovernanceService()

    expect(service.getPolicy()).toEqual({
      database: 'postgresql',
      automatedBackupCadence: 'daily',
      retentionDays: 7,
      recoveryObjectives: {
        rtoHours: 4,
        rpoHours: 24,
      },
      recoveryDrillCadence: 'quarterly',
    })
  })
})

describe('BackupGovernanceService.evaluateSnapshot', () => {
  it('marks the snapshot compliant when backup, recovery objectives, and drill cadence all meet the policy', () => {
    const service = createBackupGovernanceService({
      clock: () => new Date('2026-04-21T09:00:00.000Z'),
    })

    const result = service.evaluateSnapshot({
      database: 'postgresql',
      retentionDays: 7,
      lastSuccessfulBackupAt: '2026-04-20T12:00:00.000Z',
      lastRecoveryDrillAt: '2026-02-01T00:00:00.000Z',
      latestRestoreDurationHours: 3.5,
      latestRecoveryPointAgeHours: 12,
    })

    expect(result.compliant).toBe(true)
    expect(result.backup.compliant).toBe(true)
    expect(result.backup.lastBackupAgeHours).toBe(21)
    expect(result.recoveryObjectives.compliant).toBe(true)
    expect(result.recoveryDrill.compliant).toBe(true)
    expect(result.recoveryDrill.nextDueAt).toBe('2026-05-01T00:00:00.000Z')
  })

  it('marks the snapshot non-compliant when backup retention or freshness misses the policy', () => {
    const service = createBackupGovernanceService({
      clock: () => new Date('2026-04-21T09:00:00.000Z'),
    })

    const result = service.evaluateSnapshot({
      database: 'postgresql',
      retentionDays: 5,
      lastSuccessfulBackupAt: '2026-04-19T08:00:00.000Z',
      lastRecoveryDrillAt: '2026-02-01T00:00:00.000Z',
      latestRestoreDurationHours: 3,
      latestRecoveryPointAgeHours: 8,
    })

    expect(result.compliant).toBe(false)
    expect(result.backup.compliant).toBe(false)
    expect(result.backup.retentionCompliant).toBe(false)
    expect(result.backup.freshnessCompliant).toBe(false)
    expect(result.backup.lastBackupAgeHours).toBe(49)
  })

  it('marks the snapshot non-compliant when RTO or RPO exceeds the target', () => {
    const service = createBackupGovernanceService()

    const result = service.evaluateSnapshot({
      database: 'postgresql',
      retentionDays: 7,
      lastSuccessfulBackupAt: '2026-04-20T12:00:00.000Z',
      lastRecoveryDrillAt: '2026-02-01T00:00:00.000Z',
      latestRestoreDurationHours: 4.5,
      latestRecoveryPointAgeHours: 26,
    })

    expect(result.compliant).toBe(false)
    expect(result.recoveryObjectives.compliant).toBe(false)
    expect(result.recoveryObjectives.meetsRto).toBe(false)
    expect(result.recoveryObjectives.meetsRpo).toBe(false)
  })

  it('marks the snapshot non-compliant when the quarterly recovery drill is overdue', () => {
    const service = createBackupGovernanceService({
      clock: () => new Date('2026-04-21T09:00:00.000Z'),
    })

    const result = service.evaluateSnapshot({
      database: 'postgresql',
      retentionDays: 7,
      lastSuccessfulBackupAt: '2026-04-20T12:00:00.000Z',
      lastRecoveryDrillAt: '2025-12-15T00:00:00.000Z',
      latestRestoreDurationHours: 3,
      latestRecoveryPointAgeHours: 8,
    })

    expect(result.compliant).toBe(false)
    expect(result.recoveryDrill.compliant).toBe(false)
    expect(result.recoveryDrill.overdue).toBe(true)
    expect(result.recoveryDrill.nextDueAt).toBe('2026-03-15T00:00:00.000Z')
  })
})
