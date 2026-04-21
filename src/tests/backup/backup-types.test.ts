import { describe, expect, it } from 'vitest'
import { backupSnapshotSchema } from '@/lib/backup/backup-types'

describe('backupSnapshotSchema', () => {
  it('accepts a valid backup governance snapshot', () => {
    const result = backupSnapshotSchema.safeParse({
      database: 'postgresql',
      retentionDays: 7,
      lastSuccessfulBackupAt: '2026-04-20T12:00:00.000Z',
      lastRecoveryDrillAt: '2026-02-01T00:00:00.000Z',
      latestRestoreDurationHours: 3.5,
      latestRecoveryPointAgeHours: 12,
    })

    expect(result.success).toBe(true)
  })

  it('rejects unsupported databases and invalid retention periods', () => {
    const result = backupSnapshotSchema.safeParse({
      database: 'mysql',
      retentionDays: 0,
      lastSuccessfulBackupAt: '2026-04-20T12:00:00.000Z',
      lastRecoveryDrillAt: '2026-02-01T00:00:00.000Z',
      latestRestoreDurationHours: 3.5,
      latestRecoveryPointAgeHours: 12,
    })

    expect(result.success).toBe(false)
  })
})
