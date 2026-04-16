// ─────────────────────────────────────────────────────────────────────────────
// BlobStorage インターフェース
// 本番では S3 / Cloudflare R2 の実装に差し替える
// ─────────────────────────────────────────────────────────────────────────────

export interface BlobStorage {
  /**
   * バイナリデータを指定パスにアップロードし、Blob キーを返す
   */
  upload(path: string, data: Buffer): Promise<string>

  /**
   * Blob キーに対して有効期限付き署名 URL を発行する
   * @param key - upload() が返したキー
   * @param ttlSeconds - URL 有効秒数（デフォルト: 86400 = 24h）
   */
  getSignedUrl(key: string, ttlSeconds: number): Promise<{ url: string; expiresAt: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// ローカル開発・テスト用スタブ実装
// メモリ上に保持し、署名済み URL は偽の HTTPS URL として返す
// ─────────────────────────────────────────────────────────────────────────────

export function createLocalBlobStorage(): BlobStorage {
  const store = new Map<string, Buffer>()

  return {
    async upload(path: string, data: Buffer): Promise<string> {
      const key = path
      store.set(key, data)
      return key
    },

    async getSignedUrl(key: string, ttlSeconds: number): Promise<{ url: string; expiresAt: string }> {
      if (!store.has(key)) {
        throw new Error(`BlobStorage: key not found — "${key}"`)
      }
      const expiresAt = new Date(Date.now() + ttlSeconds * 1_000).toISOString()
      // ローカルスタブ: 実際のストレージURLは本番実装で生成される
      const url = `https://local.blob.storage/${encodeURIComponent(key)}?expires=${expiresAt}`
      return { url, expiresAt }
    },
  }
}
