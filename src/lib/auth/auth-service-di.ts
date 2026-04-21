import type { AuthService } from './auth-service'
import { getDevAuthService } from './auth-dev-service'

let authService: AuthService | null = null

export function setAuthServiceForTesting(svc: AuthService): void {
  authService = svc
}

export function clearAuthServiceForTesting(): void {
  authService = null
}

export function initAuthService(svc: AuthService): void {
  authService = svc
}

export function getAuthService(): AuthService {
  if (authService) {
    return authService
  }
  if (process.env.NODE_ENV === 'development') {
    return getDevAuthService()
  }
  throw new Error(
    'AuthService is not initialized. ' +
      'テストでは setAuthServiceForTesting() を呼んでください。' +
      'プロダクションでは initAuthService() を呼んでください。',
  )
}
