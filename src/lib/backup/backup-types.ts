import { z } from 'zod'

export const BACKUP_DATABASES = ['postgresql'] as const
export type BackupDatabase = (typeof BACKUP_DATABASES)[number]

export const backupPolicySchema = z.object({
  database: z.enum(BACKUP_DATABASES),
  automatedBackupCadence: z.literal('daily'),
  retentionDays: z.number().int().positive(),
  recoveryObjectives: z.object({
    rtoHours: z.number().positive(),
    rpoHours: z.number().positive(),
  }),
  recoveryDrillCadence: z.literal('quarterly'),
})

export type BackupPolicy = z.infer<typeof backupPolicySchema>

export const backupSnapshotSchema = z.object({
  database: z.enum(BACKUP_DATABASES),
  retentionDays: z.number().int().positive(),
  lastSuccessfulBackupAt: z.string().datetime(),
  lastRecoveryDrillAt: z.string().datetime(),
  latestRestoreDurationHours: z.number().nonnegative(),
  latestRecoveryPointAgeHours: z.number().nonnegative(),
})

export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>

export interface BackupCompliance {
  compliant: boolean
  reason: string | null
}

export interface BackupFreshnessCompliance extends BackupCompliance {
  lastBackupAgeHours: number
  retentionCompliant: boolean
  freshnessCompliant: boolean
}

export interface RecoveryObjectiveCompliance extends BackupCompliance {
  meetsRto: boolean
  meetsRpo: boolean
}

export interface RecoveryDrillCompliance extends BackupCompliance {
  overdue: boolean
  nextDueAt: string
}

export interface BackupGovernanceEvaluation {
  compliant: boolean
  policy: BackupPolicy
  backup: BackupFreshnessCompliance
  recoveryObjectives: RecoveryObjectiveCompliance
  recoveryDrill: RecoveryDrillCompliance
}
