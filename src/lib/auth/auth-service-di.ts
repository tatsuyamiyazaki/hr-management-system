/**
 * AuthService のシングルトン DI モジュール。
 * - テスト: setAuthServiceForTesting / clearAuthServiceForTesting で差し替え
 * - プロダクション: アプリ起動時に initAuthService を呼んで初期化
 */
import type { AuthService } from './auth-service'

let _authService: AuthService | null = null

export function setAuthServiceForTesting(svc: AuthService): void {
  _authService = svc
}

export function clearAuthServiceForTesting(): void {
  _authService = null
}

export function getAuthService(): AuthService {
  if (_authService) return _authService
  throw new Error(
    'AuthService is not initialized. ' +
      'テストでは setAuthServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initAuthService() を呼んでください。',
  )
}

export function initAuthService(svc: AuthService): void {
  _authService = svc
}
