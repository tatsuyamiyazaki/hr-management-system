/**
 * 個人識別情報 (PII) 匿名化ユーティリティ
 *
 * AI に送信するプロンプトから個人を特定できる情報を除外する (Req 9.8)。
 *
 * 処理対象:
 *  1. 明示的に渡された employees の fullName / employeeCode / email を
 *     連番トークン `emp_NNN` に置換する。同じ社員の各フィールドは同一トークンを共有する。
 *  2. 汎用パターン (メール・電話番号・コード形式 E-数字) を
 *     `[EMAIL_REDACTED]` / `[PHONE_REDACTED]` / `[CODE_REDACTED]` に置換する。
 *
 * 復元用のマップを返し、deanonymize でトークンから原文に戻せる。
 * 正規表現ベースの REDACTED 置換は元に戻らない（意図的に情報を破棄）。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export interface AnonymizationMap {
  /** 原文 → トークン (emp_NNN 形式) への写像 */
  readonly tokens: ReadonlyMap<string, string>
}

export interface AnonymizerEmployeeInput {
  readonly id: string
  readonly fullName?: string
  readonly employeeCode?: string
  readonly email?: string
}

export interface AnonymizerInput {
  readonly text: string
  readonly employees?: readonly AnonymizerEmployeeInput[]
}

export interface AnonymizerResult {
  readonly text: string
  readonly map: AnonymizationMap
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.\w+/g
// 電話番号: 日本国内形式 0x-xxxx-xxxx / 0xxxxxxxxxx など
const PHONE_PATTERN = /\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g
// 社員コード: E-1234 〜 E-123456 を想定
const CODE_PATTERN = /\bE-\d{4,6}\b/g

const TOKEN_PREFIX = 'emp_'

const EMAIL_PLACEHOLDER = '[EMAIL_REDACTED]'
const PHONE_PLACEHOLDER = '[PHONE_REDACTED]'
const CODE_PLACEHOLDER = '[CODE_REDACTED]'

// ─────────────────────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** 正規表現特殊文字をエスケープ */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 3 桁ゼロ埋めの連番トークンを生成 (emp_001) */
function formatToken(index: number): string {
  return `${TOKEN_PREFIX}${String(index).padStart(3, '0')}`
}

/**
 * employees[] の各フィールド値を収集し、原文→トークンのマップを構築する。
 * 空文字列・undefined はスキップ。同一社員の複数フィールドは同一トークンを共有する。
 */
function buildEmployeeTokenMap(
  employees: readonly AnonymizerEmployeeInput[],
): Map<string, string> {
  const originalToToken = new Map<string, string>()
  const tokenByEmployeeId = new Map<string, string>()
  let nextIndex = 1

  for (const emp of employees) {
    let token = tokenByEmployeeId.get(emp.id)
    if (!token) {
      token = formatToken(nextIndex)
      nextIndex += 1
      tokenByEmployeeId.set(emp.id, token)
    }

    for (const value of [emp.fullName, emp.employeeCode, emp.email]) {
      if (!value || value.length === 0) continue
      if (!originalToToken.has(value)) {
        originalToToken.set(value, token)
      }
    }
  }

  return originalToToken
}

/**
 * 長い文字列から先に置換することでオーバーラップ事故を避ける
 * (例: "田中太郎" の前に "田中" を置換してしまわない)。
 */
function replaceAllByMap(text: string, tokenMap: ReadonlyMap<string, string>): string {
  const sortedEntries = Array.from(tokenMap.entries()).sort(
    (a, b) => b[0].length - a[0].length,
  )

  let result = text
  for (const [original, token] of sortedEntries) {
    const pattern = new RegExp(escapeRegExp(original), 'g')
    result = result.replace(pattern, token)
  }
  return result
}

/** 正規表現ベースの PII を REDACTED プレースホルダに置換 */
function redactPatterns(text: string): string {
  return text
    .replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER)
    .replace(PHONE_PATTERN, PHONE_PLACEHOLDER)
    .replace(CODE_PATTERN, CODE_PLACEHOLDER)
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 入力テキストから PII を匿名化する。
 *
 * @param input 対象テキスト + employees 情報 (任意)
 * @returns 匿名化済みテキストと復元用マップ
 */
export function anonymize(input: AnonymizerInput): AnonymizerResult {
  const employees = input.employees ?? []
  const tokenMap = buildEmployeeTokenMap(employees)

  // 1. 明示的に渡された値をトークン置換
  const afterTokens = replaceAllByMap(input.text, tokenMap)
  // 2. 残った一般パターンを REDACTED に
  const finalText = redactPatterns(afterTokens)

  return {
    text: finalText,
    map: { tokens: tokenMap },
  }
}

/**
 * 匿名化されたテキストからトークンを原文に戻す。
 * 復元対象は employees 由来のトークン (emp_NNN) のみ。
 * REDACTED プレースホルダは復元不可 (意図的な情報破棄)。
 */
export function deanonymize(text: string, map: AnonymizationMap): string {
  if (text.length === 0) return text

  // token → 代表的な原文 の逆引きマップを作成
  const reverseMap = new Map<string, string>()
  for (const [original, token] of map.tokens.entries()) {
    // 同一トークンに複数原文が紐づいた場合は最初の値を採用
    if (!reverseMap.has(token)) {
      reverseMap.set(token, original)
    }
  }

  return replaceAllByMap(text, reverseMap)
}
