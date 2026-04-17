/**
 * Task 6.1 / Req 1.11: パスワードのハッシュ化 (bcrypt コスト 12 以上)
 *
 * bcryptjs (Pure JS 実装) を使用する理由:
 *  - Windows 開発環境でのネイティブバインディング不具合を回避
 *  - Node/Edge どちらのランタイムでも同じ挙動
 */
import bcrypt from 'bcryptjs'

/** Req 1.11: bcrypt の最小コストファクター */
export const BCRYPT_MIN_COST = 12

/** デフォルトのコストファクター */
const DEFAULT_COST = BCRYPT_MIN_COST

export interface PasswordHasher {
  /** 平文を bcrypt でハッシュ化する */
  hash(plaintext: string): Promise<string>
  /** 平文とハッシュを比較する (一定時間比較は bcrypt 側で担保) */
  verify(plaintext: string, hash: string): Promise<boolean>
}

export interface BcryptPasswordHasherOptions {
  /** bcrypt のコストファクター。既定値 12、12 未満は早期失敗させる */
  readonly cost?: number
}

/**
 * bcryptjs を使った PasswordHasher を生成する。
 * cost < 12 は Req 1.11 違反として throw する。
 */
export function createBcryptPasswordHasher(opts?: BcryptPasswordHasherOptions): PasswordHasher {
  const cost = opts?.cost ?? DEFAULT_COST
  if (!Number.isInteger(cost) || cost < BCRYPT_MIN_COST) {
    throw new Error(`bcrypt cost must be an integer >= ${BCRYPT_MIN_COST}`)
  }

  return {
    async hash(plaintext: string): Promise<string> {
      if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('plaintext must be a non-empty string')
      }
      return bcrypt.hash(plaintext, cost)
    },

    async verify(plaintext: string, hash: string): Promise<boolean> {
      if (typeof plaintext !== 'string' || typeof hash !== 'string') {
        return false
      }
      if (plaintext.length === 0 || hash.length === 0) {
        return false
      }
      try {
        return await bcrypt.compare(plaintext, hash)
      } catch {
        // 不正なハッシュ形式等は認証失敗として扱う (例外は漏らさない)
        return false
      }
    },
  }
}
