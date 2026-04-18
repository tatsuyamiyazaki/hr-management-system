/**
 * Issue #29 / Req 14.1, 14.9: 社員ライフサイクルサービス
 *
 * - createEmployee: 招待フローを呼び出して PENDING_JOIN ユーザーを作成し、
 *   プロフィール情報（入社日・配属・役職）を EmployeeProfileRepository に保存する
 * - bulkImportUsers: CSV をパースして有効行を createEmployee に流し、失敗行を集約する
 *
 * 既存の InvitationService / WritableAuthUserRepository を再利用し、
 * ユーザー作成の責務はサービス層で重複させない。
 */
import { randomUUID } from 'node:crypto'
import { computeEmailHash } from '@/lib/shared/crypto'
import type { InvitationService } from '@/lib/auth/invitation-service'
import { EmailAlreadyExistsError } from '@/lib/auth/invitation-types'
import type { WritableAuthUserRepository } from '@/lib/auth/user-repository'
import type { ImportRowError } from '@/lib/import/import-types'
import { parseEmployeeCsv } from './employee-csv'
import {
  EmployeeAlreadyExistsError,
  type BulkImportResult,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeCsvRow,
} from './lifecycle-types'

// ─────────────────────────────────────────────────────────────────────────────
// Ports
// ─────────────────────────────────────────────────────────────────────────────

/** 社員プロフィール（入社日 / 配属 / 役職）を保存する narrow port */
export interface EmployeeProfileRepository {
  saveProfile(profile: {
    readonly userId: string
    readonly firstName: string
    readonly lastName: string
    readonly hireDate: Date
    readonly departmentId: string
    readonly positionId: string
  }): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface LifecycleService {
  /**
   * 社員を 1 件作成する。
   * - 招待フローを経由して PENDING_JOIN ユーザーを作成
   * - プロフィール（firstName / lastName / hireDate / departmentId / positionId）を保存
   * - 既存メール重複は EmployeeAlreadyExistsError として再スロー
   */
  createEmployee(input: CreateEmployeeInput, invitedByUserId: string): Promise<Employee>

  /**
   * 社員 CSV を一括インポートする。
   * - パースエラーは errors に集約
   * - 有効行は createEmployee で 1 件ずつ作成（失敗行もエラー集約）
   * - 常に totalRows = successCount + failureCount を満たす
   */
  bulkImportUsers(file: Buffer, invitedByUserId: string): Promise<BulkImportResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface LifecycleServiceDeps {
  readonly invitations: InvitationService
  readonly users: WritableAuthUserRepository
  readonly profiles: EmployeeProfileRepository
  readonly appSecret: string
  readonly jobIdFactory?: () => string
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class LifecycleServiceImpl implements LifecycleService {
  private readonly invitations: InvitationService
  private readonly users: WritableAuthUserRepository
  private readonly profiles: EmployeeProfileRepository
  private readonly appSecret: string
  private readonly jobIdFactory: () => string

  constructor(deps: LifecycleServiceDeps) {
    this.invitations = deps.invitations
    this.users = deps.users
    this.profiles = deps.profiles
    this.appSecret = deps.appSecret
    this.jobIdFactory = deps.jobIdFactory ?? randomUUID
  }

  async createEmployee(input: CreateEmployeeInput, invitedByUserId: string): Promise<Employee> {
    try {
      await this.invitations.inviteUser({ email: input.email, role: input.role }, invitedByUserId)
    } catch (err) {
      if (err instanceof EmailAlreadyExistsError) {
        throw new EmployeeAlreadyExistsError(input.email)
      }
      throw err
    }

    const emailHash = await computeEmailHash(input.email, this.appSecret)
    const created = await this.users.findByEmailHash(emailHash)
    if (!created) {
      // InvitationService が inviteUser 成功時に PENDING_JOIN を作成する契約が崩れた場合
      throw new Error('Invited user not found after inviteUser succeeded')
    }

    await this.profiles.saveProfile({
      userId: created.id,
      firstName: input.firstName,
      lastName: input.lastName,
      hireDate: input.hireDate,
      departmentId: input.departmentId,
      positionId: input.positionId,
    })

    return {
      id: created.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      hireDate: input.hireDate,
      departmentId: input.departmentId,
      positionId: input.positionId,
    }
  }

  async bulkImportUsers(file: Buffer, invitedByUserId: string): Promise<BulkImportResult> {
    const csv = file.toString('utf-8')
    const { rows, errors: parseErrors } = parseEmployeeCsv(csv)

    const errors: ImportRowError[] = [...parseErrors]
    let successCount = 0

    for (const row of rows) {
      const rowErrors = await this.createFromRow(row, invitedByUserId)
      if (rowErrors.length === 0) {
        successCount += 1
        continue
      }
      errors.push(...rowErrors)
    }

    const failureCount = errors.length
    const totalRows = successCount + failureCount

    return {
      totalRows,
      successCount,
      failureCount,
      errors,
      jobId: this.jobIdFactory(),
    }
  }

  private async createFromRow(
    row: EmployeeCsvRow,
    invitedByUserId: string,
  ): Promise<ImportRowError[]> {
    try {
      await this.createEmployee(
        {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          role: row.role,
          hireDate: row.hireDate,
          departmentId: row.departmentId,
          positionId: row.positionId,
        },
        invitedByUserId,
      )
      return []
    } catch (err) {
      return [toRowError(row.rowNumber, err)]
    }
  }
}

function toRowError(rowNumber: number, err: unknown): ImportRowError {
  if (err instanceof EmployeeAlreadyExistsError) {
    return {
      rowNumber,
      field: 'email',
      message: `既に登録済みのメールアドレスです: ${err.email}`,
    }
  }
  const message = err instanceof Error ? err.message : 'Unknown error'
  return { rowNumber, field: 'row', message }
}

export function createLifecycleService(deps: LifecycleServiceDeps): LifecycleService {
  return new LifecycleServiceImpl(deps)
}
