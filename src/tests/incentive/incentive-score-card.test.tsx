/**
 * Issue #65 / Task 18.2: IncentiveScoreCard コンポーネント レンダリングテスト
 * (Requirements: 11.4)
 *
 * renderToString で SSR 出力を検証する。
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { IncentiveScoreCard } from '@/components/incentive/IncentiveScoreCard'

describe('IncentiveScoreCard rendering', () => {
  const defaultScore = { evaluationCount: 5, cumulativeScore: 7.5 }

  it('評価実施件数を表示する', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).toContain('5')
    expect(html).toContain('件')
  })

  it('累積スコアを表示する', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).toContain('7.5')
  })

  it('ヘッダーに「評価インセンティブ」が表示される', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).toContain('評価インセンティブ')
  })

  it('aria-label が設定されている', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).toContain('aria-label="インセンティブスコア"')
  })

  it('data-testid が設定されている', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).toContain('data-testid="incentive-score-card"')
  })

  it('cycleName を渡すと表示される', () => {
    const html = renderToString(
      <IncentiveScoreCard score={defaultScore} cycleName="2026年度上期" />,
    )
    expect(html).toContain('2026年度上期')
  })

  it('cycleName が未指定の場合はサイクル名が表示されない', () => {
    const html = renderToString(<IncentiveScoreCard score={defaultScore} />)
    expect(html).not.toContain('2026年度上期')
  })

  it('件数0の場合も正しく表示される', () => {
    const zeroScore = { evaluationCount: 0, cumulativeScore: 0 }
    const html = renderToString(<IncentiveScoreCard score={zeroScore} />)
    expect(html).toContain('>0<')
    expect(html).toContain('0.0')
  })
})
