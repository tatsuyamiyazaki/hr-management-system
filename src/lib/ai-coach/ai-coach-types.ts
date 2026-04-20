/**
 * AI コーチング品質ゲート型定義
 *
 * 評価コメントの具体性・価値観関連性を判定するサービスの入出力型。
 * (Requirements: 9.2, 9.4, 9.7, 9.8)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// 対話ターン
// ─────────────────────────────────────────────────────────────────────────────

export const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

export type ChatTurn = z.infer<typeof chatTurnSchema>

// ─────────────────────────────────────────────────────────────────────────────
// ValidateInput
// ─────────────────────────────────────────────────────────────────────────────

export const validateInputSchema = z.object({
  /** 評価サイクル ID */
  cycleId: z.string().min(1),
  /** 評価者 ID（匿名化のため AI プロンプト送信前に除去） */
  evaluatorId: z.string().min(1),
  /** 被評価者の役職・等級コンテキスト（氏名除外） */
  subjectRoleContext: z.string().min(1),
  /** 評価コメント下書き */
  draftComment: z.string().min(1),
  /** これまでの対話履歴 */
  conversationHistory: z.array(chatTurnSchema),
})

export type ValidateInput = z.infer<typeof validateInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// ValidateResult（品質判定成功時）
// ─────────────────────────────────────────────────────────────────────────────

export const validateResultSchema = z.object({
  qualityOk: z.boolean(),
  missingAspects: z.array(z.string()),
  suggestions: z.string(),
  turnNumber: z.number().int().min(1),
})

export type ValidateResult = z.infer<typeof validateResultSchema>

// ─────────────────────────────────────────────────────────────────────────────
// AITimeoutResult（5秒ハードタイムアウト時）
// ─────────────────────────────────────────────────────────────────────────────

export interface AITimeoutResult {
  readonly timeout: true
  readonly elapsedMs: number
  readonly fallbackToManual: true
}

// ─────────────────────────────────────────────────────────────────────────────
// AI レスポンス JSON スキーマ（プロバイダからの生出力パース用）
// ─────────────────────────────────────────────────────────────────────────────

export const aiQualityResponseSchema = z.object({
  quality_ok: z.boolean(),
  missing_aspects: z.array(z.string()),
  suggestions: z.string(),
})

export type AIQualityResponse = z.infer<typeof aiQualityResponseSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** 品質ゲートの SLA 目標 (3秒) */
export const QUALITY_GATE_SLA_MS = 3000

/** 品質ゲートのハードタイムアウト (5秒) */
export const QUALITY_GATE_TIMEOUT_MS = 5000
