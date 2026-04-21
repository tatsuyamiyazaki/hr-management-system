import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { KpiSummaryPanel } from '@/components/dashboard/KpiSummaryPanel'
import type { DashboardSummary } from '@/lib/dashboard/dashboard-types'

describe('KpiSummaryPanel rendering', () => {
  it('renders role label and KPI metrics', () => {
    const summary: DashboardSummary = {
      role: 'MANAGER',
      scopeUserId: 'manager-1',
      emptyStateMessage: null,
      metrics: [
        { key: 'teamMemberCount', label: '担当メンバー数', value: 8, unit: 'count' },
        { key: 'evaluationCompletionRate', label: '評価完了率', value: 75.5, unit: 'percent' },
      ],
    }

    const html = renderToString(<KpiSummaryPanel summary={summary} />)

    expect(html).toContain('KPIダッシュボード')
    expect(html).toContain('マネージャービュー')
    expect(html).toContain('担当メンバー数')
    expect(html).toContain('8')
    expect(html).toContain('75.50%')
  })

  it('renders the empty state guidance when provided', () => {
    const summary: DashboardSummary = {
      role: 'EMPLOYEE',
      scopeUserId: 'employee-1',
      emptyStateMessage: 'まだ表示できるデータがありません。',
      metrics: [{ key: 'myFinalScore', label: '自分の総合評価', value: 0, unit: 'score' }],
    }

    const html = renderToString(<KpiSummaryPanel summary={summary} />)

    expect(html).toContain('データ準備中')
    expect(html).toContain('まだ表示できるデータがありません。')
  })
})
