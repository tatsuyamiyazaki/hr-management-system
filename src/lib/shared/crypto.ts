/**
 * 暗号化・ブラインドインデックスユーティリティ
 *
 * - createBlindIndex: HMAC-SHA256 によるブラインドインデックス生成
 * - normalizeEmail: メールアドレス正規化
 * - computeEmailHash: メールアドレスのブラインドインデックス計算
 * - computeEmployeeCodeHash: 社員番号のブラインドインデックス計算
 */
import { createHmac } from 'node:crypto'

/**
 * HMAC-SHA256 を使ったブラインドインデックスを生成する
 *
 * @param value - ハッシュ化する値
 * @param secret - HMAC シークレット（環境変数 APP_SECRET から取得）
 * @returns 64文字の hex 文字列
 */
export function createBlindIndex(value: string, secret: string): Promise<string> {
  const hmac = createHmac('sha256', secret)
  hmac.update(value)
  return Promise.resolve(hmac.digest('hex'))
}

/**
 * メールアドレスを正規化する（小文字化・前後トリム）
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * メールアドレスのブラインドインデックス（HMAC-SHA256）を計算する
 * ログイン時の完全一致検索に使用する
 *
 * @param email - メールアドレス（正規化前でも可）
 * @param secret - APP_SECRET（環境変数から取得すること）
 */
export async function computeEmailHash(email: string, secret: string): Promise<string> {
  return createBlindIndex(normalizeEmail(email), secret)
}

/**
 * 社員番号のブラインドインデックス（HMAC-SHA256）を計算する
 *
 * @param employeeCode - 社員番号
 * @param secret - APP_SECRET（環境変数から取得すること）
 */
export async function computeEmployeeCodeHash(employeeCode: string, secret: string): Promise<string> {
  return createBlindIndex(employeeCode, secret)
}
