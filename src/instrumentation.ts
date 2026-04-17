/**
 * Issue #107 / Task 6.4: Next.js 15 instrumentation ランタイムフック
 *
 * Next.js 15 ではサーバー起動時に `register()` を自動実行する。
 * ここで AuthService シングルトンを初期化しておかないと、
 * `/api/auth/sessions` 等のルートハンドラが getAuthService() で
 * 「AuthService is not initialized」を throw し 500 を返す (Issue #107)。
 *
 * - Node.js ランタイムでのみ初期化する (Edge ランタイムでは bcrypt/Redis が動かない)
 * - 動的 import にすることで Edge ビルドに影響を出さない
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const [{ bootstrapAuthService }, { initAuthService }] = await Promise.all([
    import('./lib/auth/auth-service-bootstrap'),
    import('./lib/auth/auth-service-di'),
  ])

  initAuthService(bootstrapAuthService())
}
