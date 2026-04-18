/**
 * Issue #31 / Req 14.7, 14.8: 退職者データ匿名化・削除要求サービス
 *
 * - anonymizeExpiredRetirees: 退職後7年経過したユーザーの一括匿名化
 * - handleDeletionRequest: 本人/法定代理人からの個人情報削除要求処理
 * - anonymizeUser: 個別ユーザーの匿名化処理（内部ヘルパ）
 *
 * 匿名化対象:
 *   User: email → 空 Bytes, emailHash → placeholder, passwordHash → placeholder
 *   Profile: firstName/lastName → "匿名", employeeCode/phoneNumber → null 等
 * 保持項目:
 *   userId, hireDate, resignDate, role, status, createdAt, updatedAt, anonymizedAt
 */

import {
  DELETABLE_FIELDS,
  RETENTION_FIELDS,
  UserAlreadyAnonymizedError,
  UserNotFoundError,
  UserNotResignedError,
  type AnonymizationError,
  type AnonymizationSummary,
  type DeletionPlan,
} from './anonymization-types'

// ─────────────────────────────────────────────────────────────────────────────
// Ports
// ─────────────────────────────────────────────────────────────────────────────

/** 匿名化対象ユーザーの読み取り用インターフェース */
export interface AnonymizationUserRecord {
  readonly id: string
  readonly status: string
  readonly resignDate: Date | null
  readonly anonymizedAt: Date | null
}

/** 匿名化対象ユーザーの読み書きリポジトリ */
export interface AnonymizationUserRepository {
  /** 退職済み・未匿名化・指定日以前に退職したユーザーを取得 */
  findResignedBefore(cutoffDate: Date): Promise<readonly AnonymizationUserRecord[]>
  /** 指定ユーザーを取得 */
  findById(userId: string): Promise<AnonymizationUserRecord | null>
  /** ユーザーの PII を匿名化してマーク */
  anonymize(userId: string, anonymizedAt: Date): Promise<void>
}

/** 監査ログ発行用の narrow port */
export interface AnonymizationAuditEmitter {
  emit(entry: {
    userId: string | null
    action: string
    resourceType: string
    resourceId: string | null
    ipAddress: string
    userAgent: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  }): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AnonymizationService {
  /**
   * 退職後7年経過したユーザーを一括匿名化する。
   * Req 14.7: 7年間保持後に匿名化（氏名・メール・個人特定情報を削除）
   */
  anonymizeExpiredRetirees(): Promise<AnonymizationSummary>

  /**
   * 本人/法定代理人からの個人情報削除要求を処理する。
   * Req 14.8: 削除可能項目と法定保持期間中の項目を識別し、削除フローを実行
   */
  handleDeletionRequest(userId: string, requestedBy: string): Promise<DeletionPlan>

  /**
   * 個別ユーザーの匿名化を実行する。
   * anonymize-user ジョブから呼び出される。
   */
  anonymizeUser(userId: string, requestedBy: string): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface AnonymizationServiceDeps {
  readonly users: AnonymizationUserRepository
  readonly auditEmitter: AnonymizationAuditEmitter
  /** 現在時刻を返す関数（テスト時に差し替え可能） */
  readonly clock?: () => Date
  /** 7年の保持期間（ミリ秒）。テスト時に差し替え可能 */
  readonly retentionPeriodMs?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** 7年 = 7 * 365.25 * 24 * 60 * 60 * 1000 ミリ秒（365.25 はうるう年を考慮した平均日数） */
const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class AnonymizationServiceImpl implements AnonymizationService {
  private readonly users: AnonymizationUserRepository
  private readonly auditEmitter: AnonymizationAuditEmitter
  private readonly clock: () => Date
  private readonly retentionPeriodMs: number

  constructor(deps: AnonymizationServiceDeps) {
    this.users = deps.users
    this.auditEmitter = deps.auditEmitter
    this.clock = deps.clock ?? (() => new Date())
    this.retentionPeriodMs = deps.retentionPeriodMs ?? SEVEN_YEARS_MS
  }

  async anonymizeExpiredRetirees(): Promise<AnonymizationSummary> {
    const now = this.clock()
    const cutoffDate = new Date(now.getTime() - this.retentionPeriodMs)

    const candidates = await this.users.findResignedBefore(cutoffDate)

    let processedCount = 0
    let skippedCount = 0
    const errors: AnonymizationError[] = []

    for (const user of candidates) {
      if (user.anonymizedAt !== null) {
        skippedCount += 1
        continue
      }

      try {
        await this.anonymizeUser(user.id, 'system:auto-anonymize')
        processedCount += 1
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ userId: user.id, reason })
      }
    }

    return { processedCount, skippedCount, errors }
  }

  async handleDeletionRequest(userId: string, requestedBy: string): Promise<DeletionPlan> {
    const user = await this.users.findById(userId)
    if (!user) {
      throw new UserNotFoundError(userId)
    }

    if (user.status !== 'RESIGNED') {
      throw new UserNotResignedError(userId)
    }

    if (user.anonymizedAt !== null) {
      throw new UserAlreadyAnonymizedError(userId)
    }

    const now = this.clock()
    const retentionExpiry = user.resignDate
      ? new Date(user.resignDate.getTime() + this.retentionPeriodMs)
      : null

    const canExecuteImmediately = retentionExpiry !== null && now >= retentionExpiry

    const deletableFields = [...DELETABLE_FIELDS]
    const retentionFields = [...RETENTION_FIELDS]

    let executedAt: Date | null = null

    if (canExecuteImmediately) {
      await this.anonymizeUser(userId, requestedBy)
      executedAt = this.clock()
    }

    return {
      userId,
      requestedBy,
      deletableFields,
      retentionFields,
      canExecuteImmediately,
      executedAt,
    }
  }

  async anonymizeUser(userId: string, requestedBy: string): Promise<void> {
    const user = await this.users.findById(userId)
    if (!user) {
      throw new UserNotFoundError(userId)
    }

    if (user.status !== 'RESIGNED') {
      throw new UserNotResignedError(userId)
    }

    if (user.anonymizedAt !== null) {
      throw new UserAlreadyAnonymizedError(userId)
    }

    const now = this.clock()
    await this.users.anonymize(userId, now)

    await this.auditEmitter.emit({
      userId: requestedBy,
      action: 'RECORD_UPDATE',
      resourceType: 'USER',
      resourceId: userId,
      ipAddress: 'system',
      userAgent: 'anonymization-service',
      before: { status: user.status, anonymizedAt: null },
      after: {
        status: user.status,
        anonymizedAt: now.toISOString(),
        anonymizedFields: [...DELETABLE_FIELDS],
      },
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAnonymizationService(deps: AnonymizationServiceDeps): AnonymizationService {
  return new AnonymizationServiceImpl(deps)
}
