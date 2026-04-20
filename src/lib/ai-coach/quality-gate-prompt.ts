/**
 * 品質ゲート AI プロンプトビルダー
 *
 * 評価コメントの具体性・価値観関連性を判定するためのプロンプトを構築する。
 * 個人情報匿名化処理を施してから AI に送信する (Req 9.8)。
 *
 * プロンプト設計原則:
 *  - システム指示: 役割定義 + タスク定義 + 出力形式の制約
 *  - コンテキスト: 被評価者の役職・等級（匿名）
 *  - 入力: 評価コメント（匿名化済み）
 *  - 出力形式: JSON {"quality_ok": bool, "missing_aspects": [...], "suggestions": "..."}
 */
import { anonymize, type AnonymizerEmployeeInput } from '../ai-gateway/anonymizer'
import type { ChatMessage } from '../ai-gateway/ai-gateway-types'
import type { ChatTurn, ValidateInput } from './ai-coach-types'

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptBuildInput {
  /** 被評価者の役職・等級コンテキスト（氏名除外） */
  subjectRoleContext: string
  /** 評価コメント下書き */
  draftComment: string
  /** これまでの対話履歴 */
  conversationHistory: ChatTurn[]
  /** 匿名化対象の社員情報（任意） */
  employees?: readonly AnonymizerEmployeeInput[]
}

export interface PromptBuildResult {
  /** AI API に送信するメッセージ配列 */
  messages: ChatMessage[]
}

// ─────────────────────────────────────────────────────────────────────────────
// システムプロンプト
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは360度評価コメントの品質を判定するAIアシスタントです。

## タスク
評価コメントが以下の2つの品質基準を満たしているか判定してください:

1. **具体性**: 具体的なエピソード（いつ・どこで・何をしたか）が含まれているか
2. **価値観関連性**: 組織の価値観やコンピテンシーとの関連性が明示されているか

## 判定基準

### 具体性の判定
- ✅ 合格: 「4月のプロジェクトXで、クライアントとの交渉時に粘り強く対応し、契約を獲得した」
- ❌ 不合格: 「いつも頑張っている」「仕事ができる」など抽象的な記述のみ

### 価値観関連性の判定
- ✅ 合格: 「チームワークの観点から、困っているメンバーに自発的に声をかけていた」
- ❌ 不合格: 価値観やコンピテンシーへの言及が一切ない

## 出力形式
必ず以下のJSON形式のみで応答してください。JSON以外のテキストは含めないでください。

\`\`\`json
{
  "quality_ok": true/false,
  "missing_aspects": ["不足している観点の配列（空配列も可）"],
  "suggestions": "改善提案のメッセージ（合格時は空文字列）"
}
\`\`\`

## 注意事項
- 個人名・社員番号はトークン化されています（emp_001 等）。これは正常です。
- [EMAIL_REDACTED] 等のプレースホルダも匿名化処理の結果です。
- 判定は厳格すぎず、実用的な基準で行ってください。
- suggestions は日本語で、具体的に何を追記すべきか提案してください。`

// ─────────────────────────────────────────────────────────────────────────────
// プロンプトビルダー
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ValidateInput からプロンプトビルダー入力を生成する。
 * evaluatorId は除外し（AI に送信しない）、匿名化処理を適用する。
 */
export function buildPromptInput(input: ValidateInput): PromptBuildInput {
  return {
    subjectRoleContext: input.subjectRoleContext,
    draftComment: input.draftComment,
    conversationHistory: input.conversationHistory,
  }
}

/**
 * AI に送信するメッセージ配列を構築する。
 *
 * 1. subjectRoleContext と draftComment を匿名化処理
 * 2. システムプロンプト + コンテキスト + 対話履歴 + 現在のコメントを組み立て
 *
 * @param input プロンプトビルダー入力
 * @returns AI API に送信するメッセージ配列
 */
export function buildQualityGatePrompt(input: PromptBuildInput): PromptBuildResult {
  const employees = input.employees ?? []

  // 匿名化処理: コメントとコンテキストを匿名化
  const anonymizedComment = anonymize({
    text: input.draftComment,
    employees,
  })

  const anonymizedContext = anonymize({
    text: input.subjectRoleContext,
    employees,
  })

  // メッセージ配列を構築
  const messages: ChatMessage[] = []

  // 1. システムプロンプト
  messages.push({
    role: 'system',
    content: SYSTEM_PROMPT,
  })

  // 2. 対話履歴を追加（匿名化済みとして扱う）
  for (const turn of input.conversationHistory) {
    const anonymizedTurn = anonymize({
      text: turn.content,
      employees,
    })
    messages.push({
      role: turn.role === 'user' ? 'user' : 'assistant',
      content: anonymizedTurn.text,
    })
  }

  // 3. 現在のコメントを評価リクエストとして追加
  const userMessage = buildUserMessage(anonymizedContext.text, anonymizedComment.text)
  messages.push({
    role: 'user',
    content: userMessage,
  })

  return { messages }
}

/**
 * ユーザーメッセージを構築する（コンテキスト + コメント）
 */
function buildUserMessage(roleContext: string, comment: string): string {
  return `以下の評価コメントの品質を判定してください。

## 被評価者コンテキスト
${roleContext}

## 評価コメント
${comment}`
}

// テスト用にエクスポート（テストで SYSTEM_PROMPT の内容を検証するため）
export { SYSTEM_PROMPT }
