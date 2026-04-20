import { describe, it, expect } from 'vitest'
import {
  buildPromptInput,
  buildQualityGatePrompt,
  SYSTEM_PROMPT,
} from '@/lib/ai-coach/quality-gate-prompt'
import type { ValidateInput } from '@/lib/ai-coach/ai-coach-types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeValidateInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    cycleId: 'cycle-1',
    evaluatorId: 'evaluator-001',
    subjectRoleContext: 'エンジニア / シニア',
    draftComment: '田中太郎さんは4月のプロジェクトでリーダーシップを発揮しました。',
    conversationHistory: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPromptInput
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPromptInput', () => {
  it('excludes evaluatorId from the output', () => {
    const input = makeValidateInput()
    const result = buildPromptInput(input)

    // evaluatorId should not be present in the output
    expect(result).not.toHaveProperty('evaluatorId')
    expect(result).not.toHaveProperty('cycleId')
  })

  it('preserves subjectRoleContext, draftComment, and conversationHistory', () => {
    const input = makeValidateInput({
      subjectRoleContext: 'マネージャー / M3等級',
      draftComment: 'テストコメント',
      conversationHistory: [{ role: 'user', content: '前のメッセージ' }],
    })

    const result = buildPromptInput(input)

    expect(result.subjectRoleContext).toBe('マネージャー / M3等級')
    expect(result.draftComment).toBe('テストコメント')
    expect(result.conversationHistory).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildQualityGatePrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildQualityGatePrompt', () => {
  it('builds messages with system prompt as first message', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: 'よく頑張っています。',
      conversationHistory: [],
    })

    expect(result.messages[0]).toEqual({
      role: 'system',
      content: SYSTEM_PROMPT,
    })
  })

  it('includes user message with context and comment', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: 'よく頑張っています。',
      conversationHistory: [],
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage?.role).toBe('user')
    expect(lastMessage?.content).toContain('エンジニア / シニア')
    expect(lastMessage?.content).toContain('よく頑張っています。')
  })

  it('includes conversation history between system and user messages', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'デザイナー / ジュニア',
      draftComment: '改善版コメント',
      conversationHistory: [
        { role: 'user', content: '初回コメント' },
        { role: 'assistant', content: 'もう少し具体的に書いてください' },
      ],
    })

    // system + history(2) + user = 4 messages
    expect(result.messages).toHaveLength(4)
    expect(result.messages[1]?.role).toBe('user')
    expect(result.messages[1]?.content).toContain('初回コメント')
    expect(result.messages[2]?.role).toBe('assistant')
    expect(result.messages[2]?.content).toContain('もう少し具体的に書いてください')
  })

  it('anonymizes employee names in draftComment', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: '田中太郎さんのリーダーシップ',
      conversationHistory: [],
      employees: [{ id: 'u1', fullName: '田中太郎' }],
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage?.content).toContain('emp_001')
    expect(lastMessage?.content).not.toContain('田中太郎')
  })

  it('anonymizes employee names in conversationHistory', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: 'テスト',
      conversationHistory: [
        { role: 'user', content: '田中太郎さんについて' },
      ],
      employees: [{ id: 'u1', fullName: '田中太郎' }],
    })

    expect(result.messages[1]?.content).toContain('emp_001')
    expect(result.messages[1]?.content).not.toContain('田中太郎')
  })

  it('anonymizes email addresses in draftComment even without employees', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: '連絡先は tanaka@example.com です',
      conversationHistory: [],
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage?.content).toContain('[EMAIL_REDACTED]')
    expect(lastMessage?.content).not.toContain('tanaka@example.com')
  })

  it('anonymizes phone numbers in draftComment', () => {
    const result = buildQualityGatePrompt({
      subjectRoleContext: 'エンジニア / シニア',
      draftComment: '電話番号 03-1234-5678 に連絡してください',
      conversationHistory: [],
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage?.content).toContain('[PHONE_REDACTED]')
    expect(lastMessage?.content).not.toContain('03-1234-5678')
  })

  it('does not include evaluatorId anywhere in messages', () => {
    const input = makeValidateInput({ evaluatorId: 'secret-evaluator-id-123' })
    const promptInput = buildPromptInput(input)
    const result = buildQualityGatePrompt(promptInput)

    const allContent = result.messages.map((m) => m.content).join('\n')
    expect(allContent).not.toContain('secret-evaluator-id-123')
  })
})
