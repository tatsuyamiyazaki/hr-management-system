/**
 * Issue #50 / Task 15.1: テスト用イベント発火 API
 *
 * POST /api/evaluation/events — ADMIN のみ
 * body: { name: EvaluationEventName, payload: unknown }
 *
 * Zod バリデーション後に EvaluationEventBus.publish を呼ぶ。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  EVALUATION_EVENT_NAMES,
  evaluationEventSchema,
} from '@/lib/evaluation/evaluation-event-types'
import { getEvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus-di'
import { requireAuthenticated } from '@/lib/skill/skill-route-helpers'

// リクエストボディのスキーマ（name のみ先に検証）
const requestBodySchema = z.object({
  name: z.enum(EVALUATION_EVENT_NAMES),
  payload: z.unknown(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 認証 & ADMIN ロールチェック
  const guard = await requireAuthenticated()
  if (!guard.ok) return guard.response
  if (guard.session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: ADMIN role required' }, { status: 403 })
  }

  // JSON パース
  let body: unknown
  try {
    body = (await request.json()) as unknown
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // name + payload の構造チェック
  const parsed = requestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { name, payload } = parsed.data

  // name に対応するスキーマでペイロードをバリデーション
  const payloadSchema = evaluationEventSchema[name]
  const payloadResult = payloadSchema.safeParse(payload)
  if (!payloadResult.success) {
    return NextResponse.json({ error: payloadResult.error.flatten() }, { status: 422 })
  }

  // バスを取得して publish
  let bus: ReturnType<typeof getEvaluationEventBus>
  try {
    bus = getEvaluationEventBus()
  } catch {
    return NextResponse.json({ error: 'EvaluationEventBus not initialized' }, { status: 503 })
  }

  try {
    // payloadResult.data は name に対応した型になっているが、
    // 型システム上は union になるため型アサーションで解決する
    await bus.publish(name, payloadResult.data as Parameters<typeof bus.publish>[1])
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('[POST /api/evaluation/events] publish error:', err)
    return NextResponse.json({ error: 'Failed to publish event' }, { status: 500 })
  }
}
