import type { CareerWishService } from './career-wish-service'

let _careerWishService: CareerWishService | null = null

export function setCareerWishServiceForTesting(svc: CareerWishService): void {
  _careerWishService = svc
}

export function clearCareerWishServiceForTesting(): void {
  _careerWishService = null
}

export function getCareerWishService(): CareerWishService {
  if (_careerWishService) return _careerWishService
  throw new Error(
    'CareerWishService is not initialized. ' +
      'テストでは setCareerWishServiceForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initCareerWishService() を呼んでください。',
  )
}

export function initCareerWishService(svc: CareerWishService): void {
  _careerWishService = svc
}
