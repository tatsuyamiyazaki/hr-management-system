/**
 * AI コーチングサービス — 品質ゲート判定ロジック
 *
 * 評価コメントの具体性・価値観関連性を AI で判定する。
 * (Requirements: 9.2, 9.4, 9.7, 9.8)
 *
 * - 3秒 SLA を目標とし、超過時は WARN ログ記録
 * - 5秒ハードタイムアウトで AITimeoutResult を返して手動モード切替
 * - AI レスポンスの JSON パースに失敗した場合はフォールバック
 */
import type { AIGateway } from '../ai-gateway/ai-gateway'
import type { AIChatResponse } from '../ai-gateway/ai-gateway-types'
import { AITimeoutError } from '../ai-gateway/ai-gateway-types'
import {
  aiQualityResponseSchema,
  QUALITY_GATE_SLA_MS,
  QUALITY_GATE_TIMEOUT_MS,
  type AIQualityResponse,
  type AITimeoutResult,
  type ValidateInput,
  type ValidateResult,
  validateInputSchema,
} from './ai-coach-types'
import { buildPromptInput, buildQualityGatePrompt } from './quality-gate-prompt'
import type { AnonymizerEmployeeInput } from '../ai-gateway/anonymizer'

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AICoachService {
  validateComment(input: ValidateInput): Promise<ValidateResult | AITimeoutResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies (Port パターン)
// ─────────────────────────────────────────────────────────────────────────────

export interface AICoachServiceDeps {
  /** AI Gateway (タイムアウト付き呼び出し) */
  readonly gateway: AIGateway
  /** 現在時刻取得（テスト用 DI） */
  readonly clock?: () => number
  /** SLA 超過時のログハンドラ */
  readonly onSlaExceeded?: (elapsedMs: number) => void
  /** タイムアウト時のログハンドラ（監査ログ記録用） */
  readonly onTimeout?: (elapsedMs: number) => void
  /** 匿名化対象の社員情報取得（任意） */
  readonly getEmployees?: (cycleId: string) => Promise<readonly AnonymizerEmployeeInput[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// AI レスポンスパーサー
// ─────────────────────────────────────────────────────────────────────────────

type ParseResult = { success: true; data: AIQualityResponse } | { success: false }

/**
 * AI レスポンスの content から JSON をパースし、スキーマ検証を行う。
 * JSON ブロック (```json ... ```) 形式と直接 JSON 両方に対応する。
 */
export function parseAIResponse(content: string): ParseResult {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  const jsonText = codeBlockMatch?.[1] ?? content

  try {
    const parsed: unknown = JSON.parse(jsonText.trim())
    const result = aiQualityResponseSchema.safeParse(parsed)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false }
  } catch {
    return { success: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AICoachService を生成する。
 */
export function createAICoachService(deps: AICoachServiceDeps): AICoachService {
  const { gateway, onSlaExceeded, onTimeout, getEmployees } = deps
  const clock = deps.clock ?? (() => Date.now())

  async function validateComment(input: ValidateInput): Promise<ValidateResult | AITimeoutResult> {
    // 1. 入力バリデーション
    const parsed = validateInputSchema.parse(input)

    // 2. 匿名化用の社員情報を取得
    const employees = getEmployees ? await getEmployees(parsed.cycleId) : []

    // 3. プロンプト構築（evaluatorId は除外される）
    const promptInput = buildPromptInput(parsed)
    const { messages } = buildQualityGatePrompt({ ...promptInput, employees })

    // 4. AI Gateway 呼び出し（5秒ハードタイムアウト）
    const startTime = clock()
    let response: AIChatResponse

    try {
      response = await gateway.chat({
        domain: 'ai-coach',
        messages,
        timeoutMs: QUALITY_GATE_TIMEOUT_MS,
        enablePromptCache: true,
      })
    } catch (error) {
      if (error instanceof AITimeoutError) {
        const elapsedMs = error.elapsedMs
        onTimeout?.(elapsedMs)
        return buildTimeoutResult(elapsedMs)
      }
      throw error
    }

    const elapsedMs = clock() - startTime

    // 5. SLA チェック（3秒超過で WARN）
    if (elapsedMs > QUALITY_GATE_SLA_MS) {
      onSlaExceeded?.(elapsedMs)
    }

    // 6. レスポンスパース（リトライ付き）
    const turnNumber = parsed.conversationHistory.length + 1
    return parseAndBuildResult(response.content, turnNumber)
  }

  return { validateComment }
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function parseAndBuildResult(
  content: string,
  turnNumber: number,
): ValidateResult {
  const parsed = parseAIResponse(content)

  if (parsed.success) {
    return {
      qualityOk: parsed.data.quality_ok,
      missingAspects: parsed.data.missing_aspects,
      suggestions: parsed.data.suggestions,
      turnNumber,
    }
  }

  // パース失敗時はフォールバック: 品質NG + 手動確認を促す
  return {
    qualityOk: false,
    missingAspects: ['AI応答の解析に失敗しました'],
    suggestions: 'AI の応答を解析できませんでした。コメントを見直して再送信してください。',
    turnNumber,
  }
}

function buildTimeoutResult(elapsedMs: number): AITimeoutResult {
  return {
    timeout: true,
    elapsedMs,
    fallbackToManual: true,
  }
}
