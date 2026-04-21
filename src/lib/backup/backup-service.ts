import {
  backupSnapshotSchema,
  type BackupGovernanceEvaluation,
  type BackupPolicy,
  type BackupSnapshot,
} from './backup-types'

const HOURS_PER_DAY = 24
const MONTHS_PER_QUARTER = 3

const DEFAULT_POLICY: BackupPolicy = {
  database: 'postgresql',
  automatedBackupCadence: 'daily',
  retentionDays: 7,
  recoveryObjectives: {
    rtoHours: 4,
    rpoHours: 24,
  },
  recoveryDrillCadence: 'quarterly',
}

export interface BackupGovernanceService {
  getPolicy(): BackupPolicy
  evaluateSnapshot(snapshot: BackupSnapshot): BackupGovernanceEvaluation
}

interface BackupGovernanceDeps {
  clock: () => Date
}

class DefaultBackupGovernanceService implements BackupGovernanceService {
  constructor(private readonly deps: BackupGovernanceDeps) {}

  getPolicy(): BackupPolicy {
    return DEFAULT_POLICY
  }

  evaluateSnapshot(snapshot: BackupSnapshot): BackupGovernanceEvaluation {
    const parsed = backupSnapshotSchema.parse(snapshot)
    const policy = this.getPolicy()
    const now = this.deps.clock()

    const backupAgeHours = diffHours(now, new Date(parsed.lastSuccessfulBackupAt))
    const retentionCompliant = parsed.retentionDays >= policy.retentionDays
    const freshnessCompliant = backupAgeHours <= HOURS_PER_DAY
    const backupCompliant = retentionCompliant && freshnessCompliant

    const meetsRto = parsed.latestRestoreDurationHours <= policy.recoveryObjectives.rtoHours
    const meetsRpo = parsed.latestRecoveryPointAgeHours <= policy.recoveryObjectives.rpoHours
    const recoveryObjectivesCompliant = meetsRto && meetsRpo

    const nextDueDate = addMonthsUtc(new Date(parsed.lastRecoveryDrillAt), MONTHS_PER_QUARTER)
    const overdue = nextDueDate.getTime() < now.getTime()
    const recoveryDrillCompliant = !overdue

    return {
      compliant: backupCompliant && recoveryObjectivesCompliant && recoveryDrillCompliant,
      policy,
      backup: {
        compliant: backupCompliant,
        reason: backupCompliant ? null : buildBackupReason(retentionCompliant, freshnessCompliant),
        lastBackupAgeHours: backupAgeHours,
        retentionCompliant,
        freshnessCompliant,
      },
      recoveryObjectives: {
        compliant: recoveryObjectivesCompliant,
        reason: recoveryObjectivesCompliant
          ? null
          : buildRecoveryObjectiveReason(meetsRto, meetsRpo),
        meetsRto,
        meetsRpo,
      },
      recoveryDrill: {
        compliant: recoveryDrillCompliant,
        reason: recoveryDrillCompliant ? null : 'Quarterly recovery drill is overdue.',
        overdue,
        nextDueAt: nextDueDate.toISOString(),
      },
    }
  }
}

function diffHours(later: Date, earlier: Date): number {
  const diffMs = later.getTime() - earlier.getTime()
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
}

function addMonthsUtc(value: Date, months: number): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  )
}

function buildBackupReason(retentionCompliant: boolean, freshnessCompliant: boolean): string {
  if (!retentionCompliant && !freshnessCompliant) {
    return 'Backup retention and daily freshness requirements are not met.'
  }

  if (!retentionCompliant) {
    return 'Backup retention is below 7 days.'
  }

  return 'Latest successful backup is older than 24 hours.'
}

function buildRecoveryObjectiveReason(meetsRto: boolean, meetsRpo: boolean): string {
  if (!meetsRto && !meetsRpo) {
    return 'Recovery time and recovery point objectives are exceeded.'
  }

  if (!meetsRto) {
    return 'Recovery time objective exceeds 4 hours.'
  }

  return 'Recovery point objective exceeds 24 hours.'
}

export function createBackupGovernanceService(
  deps: Partial<BackupGovernanceDeps> = {},
): BackupGovernanceService {
  return new DefaultBackupGovernanceService({
    clock: deps.clock ?? (() => new Date()),
  })
}
