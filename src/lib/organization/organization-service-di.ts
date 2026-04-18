/**
 * Issue #27: OrganizationService のシングルトン DI モジュール。
 * master-service-di.ts と同一パターン。
 */
import type { OrganizationService } from './organization-service'

let _organizationService: OrganizationService | null = null

export function setOrganizationServiceForTesting(svc: OrganizationService): void {
  _organizationService = svc
}

export function clearOrganizationServiceForTesting(): void {
  _organizationService = null
}

export function getOrganizationService(): OrganizationService {
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
