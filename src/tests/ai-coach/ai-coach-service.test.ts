import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAICoachService,
  parseAIResponse,
  type AICoachServiceDeps,
} from '@/lib/ai-coach/ai-coach-service'
import type { AIGateway } from '@/lib/ai-gateway/ai-gateway'
import { AITimeoutError } from '@/lib/ai-gateway/ai-gateway-types'
import type { AIChatRequest, AIChatResponse } from '@/lib/ai-gateway/ai-gateway-types'
import {
  QUALITY_GATE_SLA_MS,
  QUALITY_GATE_TIMEOUT_MS,
  type ValidateInput,
} from '@/lib/ai-coach/ai-coach-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeValidateInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    cycleId: 'cycle-1',
    evaluatorId: 'evaluator-001',
    subjectRoleContext: 'エンジニア / シニア',
    draftComment: 'テストコメント',
    conversationHistory: [],
    ...overrides,
  }
}

function buildMockResponse(content: string): AIChatResponse {
  return {
    content,
    provider: 'claude',
    usage: { promptTokens: 100, completionTokens: 50 },
    cached: false,
  }
}

function buildQualityOkResponse(): AIChatResponse {
  return buildMockResponse(
    JSON.stringify({
      quality_ok: true,
      missing_aspects: [],
      suggestions: '',
    }),
  )
}

function buildQualityNgResponse(): AIChatResponse {
  return buildMockResponse(
    JSON.stringify({
      quality_ok: false,
      missing_aspects: ['具体的なエピソードが不足しています'],
      suggestions: '具体的な場面や行動を追記してください。',
    }),
  )
}

function buildMockGateway(
  chatFn: ReturnType<typeof vi.fn>,
): AIGateway {
  return {
    chat: chatFn as unknown as AIGateway['chat'],
    getCurrentProvider: () => 'claude',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseAIResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('parseAIResponse', () => {
  it('parses valid JSON response', () => {
    const content = JSON.stringify({
      quality_ok: true,
      missing_aspects: [],
      suggestions: '',
    })

    const result = parseAIResponse(content)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quality_ok).toBe(true)
      expect(result.data.missing_aspects).toEqual([])
      expect(result.data.suggestions).toBe('')
    }
  })

  it('parses JSON inside a code block', () => {
    const content = '```json\n{"quality_ok": false, "missing_aspects": ["具体性不足"], "suggestions": "エピソードを追加してください"}\n```'

    const result = parseAIResponse(content)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quality_ok).toBe(false)
      expect(result.data.missing_aspects).toEqual(['具体性不足'])
    }
  })

  it('parses JSON inside a code block without language tag', () => {
    const content = '```\n{"quality_ok": true, "missing_aspects": [], "suggestions": ""}\n```'

    const result = parseAIResponse(content)
    expect(result.success).toBe(true)
  })

  it('returns failure for invalid JSON', () => {
    const result = parseAIResponse('not a json string')
    expect(result.success).toBe(false)
  })

  it('returns failure for JSON missing required fields', () => {
    const result = parseAIResponse(JSON.stringify({ quality_ok: true }))
    expect(result.success).toBe(false)
  })

  it('returns failure for JSON with wrong field types', () => {
    const result = parseAIResponse(
      JSON.stringify({
        quality_ok: 'yes',
        missing_aspects: 'string instead of array',
        suggestions: 123,
      }),
    )
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createAICoachService.validateComment
// ─────────────────────────────────────────────────────────────────────────────

describe('createAICoachService.validateComment', () => {
  let chatFn: ReturnType<typeof vi.fn>
  let onSlaExceeded: ReturnType<typeof vi.fn>
  let onTimeout: ReturnType<typeof vi.fn>

  beforeEach(() => {
    chatFn = vi.fn()
    onSlaExceeded = vi.fn()
    onTimeout = vi.fn()
  })

  function buildService(overrides: Partial<AICoachServiceDeps> = {}) {
    return createAICoachService({
      gateway: buildMockGateway(chatFn),
      onSlaExceeded,
      onTimeout,
      ...overrides,
    })
  }

  it('returns ValidateResult with qualityOk=true for quality passing comment', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    const service = buildService()
    const result = await service.validateComment(makeValidateInput())

    expect(result).toEqual({
      qualityOk: true,
      missingAspects: [],
      suggestions: '',
      turnNumber: 1,
    })
  })

  it('returns ValidateResult with qualityOk=false for quality failing comment', async () => {
    chatFn.mockResolvedValue(buildQualityNgResponse())

    const service = buildService()
    const result = await service.validateComment(makeValidateInput())

    expect(result).toEqual({
      qualityOk: false,
      missingAspects: ['具体的なエピソードが不足しています'],
      suggestions: '具体的な場面や行動を追記してください。',
      turnNumber: 1,
    })
  })

  it('increments turnNumber based on conversationHistory length', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    const service = buildService()
    const result = await service.validateComment(
      makeValidateInput({
        conversationHistory: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'response' },
        ],
      }),
    )

    expect(result).toHaveProperty('turnNumber', 3)
  })

  it('sends request with domain=ai-coach and timeoutMs=5000', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    const service = buildService()
    await service.validateComment(makeValidateInput())

    expect(chatFn).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'ai-coach',
        timeoutMs: QUALITY_GATE_TIMEOUT_MS,
        enablePromptCache: true,
      }),
    )
  })

  it('does not include evaluatorId in messages sent to AI', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    const service = buildService()
    await service.validateComment(
      makeValidateInput({ evaluatorId: 'secret-evaluator-id' }),
    )

    const sentRequest = chatFn.mock.calls[0]?.[0] as AIChatRequest
    const allContent = sentRequest.messages.map((m) => m.content).join('\n')
    expect(allContent).not.toContain('secret-evaluator-id')
  })

  it('calls onSlaExceeded when response takes longer than 3 seconds', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    let clockValue = 0
    const service = buildService({
      gateway: buildMockGateway(chatFn),
      clock: () => {
        const v = clockValue
        clockValue += QUALITY_GATE_SLA_MS + 100 // 3100ms on second call
        return v
      },
    })

    await service.validateComment(makeValidateInput())

    expect(onSlaExceeded).toHaveBeenCalledWith(QUALITY_GATE_SLA_MS + 100)
  })

  it('does not call onSlaExceeded when response is within 3 seconds', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    let clockValue = 0
    const service = buildService({
      gateway: buildMockGateway(chatFn),
      clock: () => {
        const v = clockValue
        clockValue += 1000 // 1000ms elapsed
        return v
      },
    })

    await service.validateComment(makeValidateInput())

    expect(onSlaExceeded).not.toHaveBeenCalled()
  })

  it('returns AITimeoutResult when gateway throws AITimeoutError', async () => {
    chatFn.mockRejectedValue(new AITimeoutError(QUALITY_GATE_TIMEOUT_MS))

    const service = buildService()
    const result = await service.validateComment(makeValidateInput())

    expect(result).toEqual({
      timeout: true,
      elapsedMs: QUALITY_GATE_TIMEOUT_MS,
      fallbackToManual: true,
    })
  })

  it('calls onTimeout when gateway throws AITimeoutError', async () => {
    chatFn.mockRejectedValue(new AITimeoutError(5000))

    const service = buildService()
    await service.validateComment(makeValidateInput())

    expect(onTimeout).toHaveBeenCalledWith(5000)
  })

  it('propagates non-timeout errors from gateway', async () => {
    chatFn.mockRejectedValue(new Error('Network error'))

    const service = buildService()
    await expect(service.validateComment(makeValidateInput())).rejects.toThrow(
      'Network error',
    )
  })

  it('returns fallback result when AI returns unparseable response', async () => {
    chatFn.mockResolvedValue(buildMockResponse('Sorry, I cannot help with that.'))

    const service = buildService()
    const result = await service.validateComment(makeValidateInput())

    expect(result).toHaveProperty('qualityOk', false)
    expect(result).toHaveProperty('missingAspects', ['AI応答の解析に失敗しました'])
    expect(result).toHaveProperty('turnNumber', 1)
  })

  it('anonymizes employee names when getEmployees is provided', async () => {
    chatFn.mockResolvedValue(buildQualityOkResponse())

    const getEmployees = vi.fn().mockResolvedValue([
      { id: 'u1', fullName: '田中太郎' },
    ])

    const service = buildService({
      gateway: buildMockGateway(chatFn),
      getEmployees,
    })

    await service.validateComment(
      makeValidateInput({ draftComment: '田中太郎さんのリーダーシップ' }),
    )

    const sentRequest = chatFn.mock.calls[0]?.[0] as AIChatRequest
    const allContent = sentRequest.messages.map((m) => m.content).join('\n')
    expect(allContent).toContain('emp_001')
    expect(allContent).not.toContain('田中太郎')
  })

  it('validates input with Zod and rejects invalid input', async () => {
    const service = buildService()
    await expect(
      service.validateComment({
        cycleId: '',
        evaluatorId: 'evaluator-001',
        subjectRoleContext: 'test',
        draftComment: 'test',
        conversationHistory: [],
      }),
    ).rejects.toThrow()
  })
})
