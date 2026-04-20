/**
 * Issue #58 / Task 16.2: AICoachChat コンポーネント レンダリングテスト
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * renderToString で SSR 出力を検証する。
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AICoachChat } from '@/components/evaluation/AICoachChat'

describe('AICoachChat rendering', () => {
  const defaultProps = {
    cycleId: 'cycle-1',
    subjectRoleContext: 'エンジニア / シニア',
  }

  it('ヘッダーに「AIコーチング」が表示される', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('AIコーチング')
  })

  it('初期状態でプレースホルダーテキストが表示される', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('評価コメントを入力してAIコーチングを開始してください')
  })

  it('評価コメント入力欄が表示される', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('評価コメントを入力してください')
  })

  it('初期状態で「評価完了」ボタンが無効化されている (Req 9.3)', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('評価完了')
    expect(html).toContain('disabled')
  })

  it('送信ボタンが表示される', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('送信')
  })

  it('チャットログ領域に aria-live="polite" が設定されている', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('aria-live="polite"')
  })

  it('チャットログ領域に role="log" が設定されている', () => {
    const html = renderToString(<AICoachChat {...defaultProps} />)
    expect(html).toContain('role="log"')
  })
})
