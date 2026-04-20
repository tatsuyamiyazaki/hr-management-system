/**
 * Issue #55 / Task 17.1, 17.2: マイルド化変換・要約生成プロンプト単体テスト
 *
 * - プロンプト構築の検証
 * - AI レスポンスパース検証
 * - 要約プロンプト構築の検証
 * - 要約レスポンスパース検証
 */
import { describe, it, expect } from 'vitest'
import {
  buildMildifyPrompt,
  parseMildifyResponse,
  buildSummaryPrompt,
  parseSummaryResponse,
} from '@/lib/feedback/feedback-prompt'

// ─────────────────────────────────────────────────────────────────────────────
// buildMildifyPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMildifyPrompt', () => {
  it('system + user の2メッセージを返す', () => {
    const messages = buildMildifyPrompt({
      rawComments: ['コメント1', 'コメント2'],
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.role).toBe('user')
  })

  it('user メッセージにコメントの JSON 配列が含まれる', () => {
    const messages = buildMildifyPrompt({
      rawComments: ['仕事が遅い', 'やる気がない'],
    })

    const userContent = messages[1]!.content
    expect(userContent).toBe(JSON.stringify(['仕事が遅い', 'やる気がない']))
  })

  it('system メッセージにマイルド化の指示が含まれる', () => {
    const messages = buildMildifyPrompt({
      rawComments: ['テスト'],
    })

    expect(messages[0]!.content).toContain('マイルド化変換')
    expect(messages[0]!.content).toContain('建設的')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseMildifyResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('parseMildifyResponse', () => {
  it('正常な JSON 配列をパースできる', () => {
    const result = parseMildifyResponse('["変換1", "変換2"]')

    expect(result).toEqual(['変換1', '変換2'])
  })

  it('```json コードブロックで囲まれたレスポンスをパースできる', () => {
    const content = '```json\n["変換1", "変換2"]\n```'
    const result = parseMildifyResponse(content)

    expect(result).toEqual(['変換1', '変換2'])
  })

  it('不正な JSON は null を返す', () => {
    const result = parseMildifyResponse('not json')

    expect(result).toBeNull()
  })

  it('配列でない JSON は null を返す', () => {
    const result = parseMildifyResponse('{"key": "value"}')

    expect(result).toBeNull()
  })

  it('文字列でない要素を含む配列は null を返す', () => {
    const result = parseMildifyResponse('[1, 2, 3]')

    expect(result).toBeNull()
  })

  it('空配列はパースできる', () => {
    const result = parseMildifyResponse('[]')

    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildSummaryPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSummaryPrompt', () => {
  it('system + user の2メッセージを返す', () => {
    const messages = buildSummaryPrompt({
      transformedComments: ['コメント1', 'コメント2'],
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.role).toBe('user')
  })

  it('user メッセージにコメントの JSON 配列が含まれる', () => {
    const messages = buildSummaryPrompt({
      transformedComments: ['丁寧さを意識するとさらに良くなります', 'モチベーション向上のサポートが有効です'],
    })

    const userContent = messages[1]!.content
    expect(userContent).toBe(
      JSON.stringify(['丁寧さを意識するとさらに良くなります', 'モチベーション向上のサポートが有効です']),
    )
  })

  it('system メッセージに要約指示が含まれる', () => {
    const messages = buildSummaryPrompt({
      transformedComments: ['テスト'],
    })

    expect(messages[0]!.content).toContain('要約')
    expect(messages[0]!.content).toContain('強み')
    expect(messages[0]!.content).toContain('改善点')
    expect(messages[0]!.content).toContain('200〜300文字')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseSummaryResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSummaryResponse', () => {
  it('正常なテキストをそのまま返す', () => {
    const input = '強みとして丁寧なコミュニケーションが評価されています。改善点としてはタスク管理の精度向上が期待されます。'
    const result = parseSummaryResponse(input)

    expect(result).toBe(input)
  })

  it('前後の空白をトリムする', () => {
    const result = parseSummaryResponse('  要約テキスト  ')

    expect(result).toBe('要約テキスト')
  })

  it('```コードブロックで囲まれたレスポンスをパースできる', () => {
    const content = '```\n要約テキストです\n```'
    const result = parseSummaryResponse(content)

    expect(result).toBe('要約テキストです')
  })

  it('空文字列は null を返す', () => {
    const result = parseSummaryResponse('')

    expect(result).toBeNull()
  })

  it('空白のみの文字列は null を返す', () => {
    const result = parseSummaryResponse('   ')

    expect(result).toBeNull()
  })
})
