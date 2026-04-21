/**
 * Issue #27: OrganizationService のシングルトン DI モジュール。
 * master-service-di.ts と同一パターン。
 */
import { createDevelopmentOrganizationService } from './organization-dev-service'
import type { OrganizationService } from './organization-service'

let _organizationService: OrganizationService | null = null

function isDevelopmentOrganizationFallbackEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false
  }

  return process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1'
}

export function setOrganizationServiceForTesting(svc: OrganizationService): void {
  _organizationService = svc
}

export function clearOrganizationServiceForTesting(): void {
  _organizationService = null
}

export function getOrganizationService(): OrganizationService {
  if (!_organizationService && isDevelopmentOrganizationFallbackEnabled()) {
    _organizationService = createDevelopmentOrganizationService()
  }

  if (_organizationService) return _organizationService
  throw new Error(
    'OrganizationService is not initialized. ' +
      'テストでは setOrganizationServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initOrganizationService() を呼んでください。',
  )
}

export function initOrganizationService(svc: OrganizationService): void {
  _organizationService = svc
}
