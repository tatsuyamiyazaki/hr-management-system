/**
 * Issue #55 / Task 17.1: マイルド化変換プロンプトビルダー
 *
 * ネガティブ・攻撃的な表現を建設的な表現に書き換えるための
 * AI プロンプトを構築する。
 *
 * 関連要件: Req 10.1, 10.2
 */
import type { ChatMessage } from '@/lib/ai-gateway/ai-gateway-types'

// ─────────────────────────────────────────────────────────────────────────────
// システムプロンプト
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは360度評価フィードバックのマイルド化変換を行うAIアシスタントです。

## タスク
入力された評価コメントのネガティブ・攻撃的な表現を、建設的で前向きな表現に書き換えてください。

## ルール
1. 元のフィードバックの意図・指摘内容は保持すること
2. 人格否定・攻撃的表現を改善提案型の表現に変換すること
3. 具体的な改善アクションが読み取れる表現にすること
4. ポジティブな側面があれば残すこと
5. 変換が不要な場合（すでに建設的な表現）はそのまま返すこと

## 出力形式
JSON配列で返してください。入力と同じ順序で変換後テキストを返します。
\`\`\`json
["変換後テキスト1", "変換後テキスト2", ...]
\`\`\`

余計な説明は不要です。JSON配列のみを返してください。`

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

export interface MildifyPromptInput {
  /** マイルド化対象の生コメント群 */
  rawComments: readonly string[]
}

/**
 * マイルド化変換用のプロンプトメッセージ配列を構築する。
 */
export function buildMildifyPrompt(input: MildifyPromptInput): ChatMessage[] {
  const userContent = JSON.stringify(input.rawComments)

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}

/**
 * AI レスポンスをパースして変換後テキスト配列を返す。
 * JSON パースに失敗した場合や配列でない場合は null を返す。
 */
export function parseMildifyResponse(content: string): string[] | null {
  try {
    // ```json ... ``` で囲まれている場合を考慮
    const cleaned = content
      .replace(/^```json\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    const parsed: unknown = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) return null
    if (!parsed.every((item) => typeof item === 'string')) return null

    return parsed as string[]
  } catch {
    return null
  }
}
