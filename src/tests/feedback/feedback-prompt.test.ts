/**
 * Issue #55 / Task 17.1: マイルド化変換プロンプト単体テスト
 *
 * - プロンプト構築の検証
 * - AI レスポンスパース検証
 */
import { describe, it, expect } from 'vitest'
import { buildMildifyPrompt, parseMildifyResponse } from '@/lib/feedback/feedback-prompt'

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
