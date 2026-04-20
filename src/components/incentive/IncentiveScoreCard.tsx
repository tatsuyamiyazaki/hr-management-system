/**
 * Issue #65 / Task 18.2: インセンティブスコアカード (Req 11.4)
 *
 * - 現在のサイクルの評価実施件数と累積インセンティブスコアを表示
 * - マイページに配置するカードコンポーネント
 */
'use client'

import type { ReactElement } from 'react'
import type { IncentiveScore } from '@/lib/incentive/incentive-types'

interface IncentiveScoreCardProps {
  readonly score: IncentiveScore
  readonly cycleName?: string
}

export function IncentiveScoreCard({ score, cycleName }: IncentiveScoreCardProps): ReactElement {
  return (
    <section
      data-testid="incentive-score-card"
      aria-label="インセンティブスコア"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">
          Incentive
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">評価インセンティブ</h2>
        {cycleName && <p className="mt-0.5 text-xs text-slate-500">{cycleName}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">評価実施件数</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {score.evaluationCount}
            <span className="ml-1 text-sm font-normal text-slate-500">件</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-500">累積スコア</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-indigo-700">
            {score.cumulativeScore.toFixed(1)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
