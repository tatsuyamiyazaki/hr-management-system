/**
 * Issue #50 / Task 15.1: EvaluationEventBus DI シングルトン
 *
 * - テスト: setEvaluationEventBusForTesting / clearEvaluationEventBusForTesting で差し替え
 * - プロダクション: アプリ起動時に initEvaluationEventBus を呼んで初期化
 */
import type { EvaluationEventBus } from './evaluation-event-bus'

let _bus: EvaluationEventBus | null = null

export function initEvaluationEventBus(bus: EvaluationEventBus): void {
  _bus = bus
}

export function getEvaluationEventBus(): EvaluationEventBus {
  if (_bus) return _bus
  throw new Error(
    'EvaluationEventBus is not initialized. ' +
      'テストでは setEvaluationEventBusForTesting() を呼んでください。' +
      'プロダクションではサーバー起動前に initEvaluationEventBus() を呼んでください。',
  )
}

export function setEvaluationEventBusForTesting(bus: EvaluationEventBus): void {
  _bus = bus
}

export function clearEvaluationEventBusForTesting(): void {
  _bus = null
}
