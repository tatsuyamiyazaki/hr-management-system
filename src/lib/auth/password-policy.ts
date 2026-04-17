/**
 * Task 6.2 / Req 1.12: パスワード強度ポリシー
 *
 * - 最低 12 文字 (PASSWORD_MIN_LENGTH)
 * - 英大文字 / 英小文字 / 数字 / 記号のうち 3 種以上 (PASSWORD_REQUIRED_CHAR_CLASSES)
 *
 * 過去履歴チェック (Req 1.13) は password-history-repository / password-service 側に分離する。
 * 本モジュールは文字列のみを見る純粋バリデータを提供する。
 */
import { PasswordPolicyViolationError } from './auth-types'

/** Req 1.12: 最低パスワード長 */
export const PASSWORD_MIN_LENGTH = 12

/** Req 1.12: 4 種文字クラスのうち何種類以上を必須とするか (>= 3) */
export const PASSWORD_REQUIRED_CHAR_CLASSES = 3

/** Req 1.13: 過去世代のパスワード保持数 (= 世代数) */
export const PASSWORD_HISTORY_SIZE = 5

export type PasswordCharClass = 'UPPERCASE' | 'LOWERCASE' | 'DIGIT' | 'SYMBOL'

// ASCII 記号のみを "SYMBOL" として扱う (Unicode 記号は含めない)
//  - 0x21-0x2F  !"#$%&'()*+,-./
//  - 0x3A-0x40  :;<=>?@
//  - 0x5B-0x60  [\]^_`
//  - 0x7B-0x7E  {|}~
const UPPERCASE_RE = /[A-Z]/
const LOWERCASE_RE = /[a-z]/
const DIGIT_RE = /\d/
const SYMBOL_RE = /[!-/:-@[-`{-~]/

/**
 * 含まれる文字クラスの集合を返す。
 * 空文字は空集合。
 */
export function classifyPassword(password: string): ReadonlySet<PasswordCharClass> {
  const classes = new Set<PasswordCharClass>()
  if (UPPERCASE_RE.test(password)) classes.add('UPPERCASE')
  if (LOWERCASE_RE.test(password)) classes.add('LOWERCASE')
  if (DIGIT_RE.test(password)) classes.add('DIGIT')
  if (SYMBOL_RE.test(password)) classes.add('SYMBOL')
  return classes
}

/**
 * true/false を返す純粋バリデータ。UI 層のヒント表示などで使用する想定。
 */
export function isPasswordStrong(password: string): boolean {
  if (typeof password !== 'string') return false
  if (password.length < PASSWORD_MIN_LENGTH) return false
  const classes = classifyPassword(password)
  return classes.size >= PASSWORD_REQUIRED_CHAR_CLASSES
}

/**
 * 強度違反があれば PasswordPolicyViolationError を throw。
 *
 * 違反優先順位:
 *   1. LENGTH  (最低長未満)
 *   2. COMPLEXITY (クラス数不足)
 *
 * 過去履歴チェック (REUSED) は別関数で扱う。
 */
export function assertPasswordStrong(password: string): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyViolationError('LENGTH')
  }
  const classes = classifyPassword(password)
  if (classes.size < PASSWORD_REQUIRED_CHAR_CLASSES) {
    throw new PasswordPolicyViolationError('COMPLEXITY')
  }
}
