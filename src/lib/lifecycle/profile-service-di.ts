/**
 * Issue #174 / Req 14.5, 14.6: ProfileService のシングルトン DI モジュール。
 * lifecycle-service-di.ts / search-service-di.ts と同一パターン。
 */
import type { ProfileService } from './profile-service'

let _profileService: ProfileService | null = null

export function setProfileServiceForTesting(svc: ProfileService): void {
  _profileService = svc
}

export function clearProfileServiceForTesting(): void {
  _profileService = null
}

export function getProfileService(): ProfileService {
  if (_profileService) return _profileService
  throw new Error(
    'ProfileService is not initialized. ' +
      'テストでは setProfileServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initProfileService() を呼んでください。',
  )
}

export function initProfileService(svc: ProfileService): void {
  _profileService = svc
}
