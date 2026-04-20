/**
 * Issue #64 / Task 18.1: IncentiveService 実装
 *
 * - EvaluationSubmitted イベントを購読し applyIncentive を自動起動
 * - qualityGatePassed === true のみ加算対象（Req 11.6）
 * - responseId unique で重複加算防止（Req 11.1）
 * - 計算式: cumulativeScore = evaluationCount × k（Req 11.3）
 *
 * 関連要件: Req 11.1, 11.2, 11.3, 11.6
 */
import type { EvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'
import type { IncentiveRecord, IncentiveRepository, IncentiveService } from './incentive-types'

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface CycleKProvider {
  /** 指定サイクルの incentiveK 係数を返す。サイクルが存在しない場合は null */
  getIncentiveK(cycleId: string): Promise<number | null>
}

export interface IncentiveServiceDeps {
  readonly incentiveRepository: IncentiveRepository
  readonly cycleKProvider: CycleKProvider
  readonly eventBus?: EvaluationEventBus
  readonly idFactory?: () => string
  readonly clock?: () => Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class IncentiveServiceImpl implements IncentiveService {
  private readonly repo: IncentiveRepository
  private readonly cycleKProvider: CycleKProvider
  private readonly idFactory: () => string
  private readonly clock: () => Date

  constructor(deps: IncentiveServiceDeps) {
    this.repo = deps.incentiveRepository
    this.cycleKProvider = deps.cycleKProvider
    this.idFactory = deps.idFactory ?? (() => crypto.randomUUID())
    this.clock = deps.clock ?? (() => new Date())

    // EvaluationSubmitted イベント購読
    if (deps.eventBus) {
      deps.eventBus.subscribe('EvaluationSubmitted', async (payload) => {
        await this.applyIncentive({
          responseId: payload.responseId,
          cycleId: payload.cycleId,
          evaluatorId: payload.evaluatorId,
          qualityGatePassed: payload.qualityGatePassed,
        })
      })
    }
  }

  async applyIncentive(params: {
    responseId: string
    cycleId: string
    evaluatorId: string
    qualityGatePassed: boolean
  }): Promise<void> {
    // qualityGatePassed=false の場合は加算対象外
    if (!params.qualityGatePassed) {
      return
    }

    // responseId で重複チェック
    const exists = await this.repo.existsByResponseId(params.responseId)
    if (exists) {
      return
    }

    // サイクルの incentiveK を取得
    const k = await this.cycleKProvider.getIncentiveK(params.cycleId)
    if (k === null) {
      return
    }

    const record: IncentiveRecord = {
      id: this.idFactory(),
      cycleId: params.cycleId,
      evaluatorId: params.evaluatorId,
      responseId: params.responseId,
      coefficientK: k,
      createdAt: this.clock(),
    }

    await this.repo.save(record)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createIncentiveService(deps: IncentiveServiceDeps): IncentiveService {
  return new IncentiveServiceImpl(deps)
}
