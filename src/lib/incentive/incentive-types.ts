/**
 * Issue #64 / Task 18.1, 18.2: インセンティブドメイン型定義
 *
 * - IncentiveRecord: 加算記録エンティティ（responseId unique で重複防止）
 * - IncentiveScore: マイページ表示用 DTO（Req 11.4）
 * - IncentiveRepository: 永続化ポート
 * - IncentiveService: サービスインターフェース
 *
 * 関連要件: Req 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

// ─────────────────────────────────────────────────────────────────────────────
// IncentiveRecord エンティティ
// ─────────────────────────────────────────────────────────────────────────────

export interface IncentiveRecord {
  readonly id: string
  readonly cycleId: string
  readonly evaluatorId: string
  readonly responseId: string // @unique 重複加算防止
  readonly coefficientK: number
  readonly createdAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// IncentiveScore DTO（マイページ表示用 Req 11.4）
// ─────────────────────────────────────────────────────────────────────────────

export interface IncentiveScore {
  /** 現在のサイクルでの評価実施件数 */
  readonly evaluationCount: number
  /** 累積インセンティブスコア = evaluationCount × k */
  readonly cumulativeScore: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository port
// ─────────────────────────────────────────────────────────────────────────────

export interface IncentiveRepository {
  /** IncentiveRecord を保存する。responseId が既に存在する場合は例外をスロー */
  save(record: IncentiveRecord): Promise<void>

  /** responseId で重複チェック */
  existsByResponseId(responseId: string): Promise<boolean>

  /** 指定サイクル・評価者のインセンティブ件数を返す */
  countByCycleAndEvaluator(cycleId: string, evaluatorId: string): Promise<number>

  /** 指定サイクルの全インセンティブレコードを返す（総合評価集計用 Req 11.5） */
  findByCycleId(cycleId: string): Promise<IncentiveRecord[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IncentiveService {
  /**
   * EvaluationSubmitted イベントから呼ばれるハンドラ。
   * qualityGatePassed=true のみ加算対象。
   * responseId unique で重複防止。
   */
  applyIncentive(params: {
    responseId: string
    cycleId: string
    evaluatorId: string
    qualityGatePassed: boolean
  }): Promise<void>

  /**
   * マイページ表示用: 現在のサイクルの評価実施件数と累積スコアを返す（Req 11.4）
   */
  getCumulativeScore(userId: string, cycleId: string): Promise<IncentiveScore>

  /**
   * 総合評価集計用: サイクル内の全評価者のインセンティブスコアを返す（Req 11.5）
   * Map<userId, adjustmentScore>
   */
  getAdjustmentForTotalEvaluation(cycleId: string): Promise<Map<string, number>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class IncentiveDuplicateError extends Error {
  constructor(responseId: string) {
    super(`Incentive already recorded for responseId="${responseId}"`)
    this.name = 'IncentiveDuplicateError'
  }
}
