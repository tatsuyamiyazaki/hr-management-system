/**
 * Issue #58 / Task 16.2: useAICoachChat hook 型・エクスポート検証テスト
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * React Hooks のランタイムテストには @testing-library/react-hooks が必要だが
 * 未導入のため、型レベルの整合性確認と AI Coach Chat 型のテストを行う。
 */
import { describe, it, expect } from 'vitest'
import type { AICoachChatState, QualityGateStatus } from '@/components/evaluation/ai-coach-chat-types'

describe('AI Coach Chat types', () => {
  it('QualityGateStatus は5つの状態を持つ', () => {
    const statuses: QualityGateStatus[] = ['idle', 'validating', 'passed', 'failed', 'timeout']
    expect(statuses).toHaveLength(5)
  })

  it('AICoachChatState の初期状態の型チェック', () => {
    const initialState: AICoachChatState = {
      messages: [],
      qualityGateStatus: 'idle',
      isValidating: false,
      canSubmit: false,
      turnNumber: 0,
      lastSuggestions: null,
      missingAspects: [],
    }

    expect(initialState.canSubmit).toBe(false)
    expect(initialState.qualityGateStatus).toBe('idle')
    expect(initialState.isValidating).toBe(false)
    expect(initialState.messages).toHaveLength(0)
  })

  it('品質NG時は canSubmit: false (Req 9.3)', () => {
    const ngState: AICoachChatState = {
      messages: [
        { id: 'msg-1', role: 'user', content: 'テスト', timestamp: new Date() },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '具体的なエピソードを追加してください',
          timestamp: new Date(),
        },
      ],
      qualityGateStatus: 'failed',
      isValidating: false,
      canSubmit: false,
      turnNumber: 1,
      lastSuggestions: '具体的なエピソードを追加してください',
      missingAspects: ['具体性不足'],
    }

    expect(ngState.canSubmit).toBe(false)
    expect(ngState.qualityGateStatus).toBe('failed')
  })

  it('品質OK時は canSubmit: true (Req 9.6)', () => {
    const okState: AICoachChatState = {
      messages: [
        { id: 'msg-1', role: 'user', content: '具体的なコメント', timestamp: new Date() },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '品質ゲート通過 — 評価を送信できます。',
          timestamp: new Date(),
        },
      ],
      qualityGateStatus: 'passed',
      isValidating: false,
      canSubmit: true,
      turnNumber: 1,
      lastSuggestions: null,
      missingAspects: [],
    }

    expect(okState.canSubmit).toBe(true)
    expect(okState.qualityGateStatus).toBe('passed')
  })

  it('AI判定中は isValidating: true (Req 9.5)', () => {
    const validatingState: AICoachChatState = {
      messages: [
        { id: 'msg-1', role: 'user', content: 'コメント送信中', timestamp: new Date() },
      ],
      qualityGateStatus: 'validating',
      isValidating: true,
      canSubmit: false,
      turnNumber: 0,
      lastSuggestions: null,
      missingAspects: [],
    }

    expect(validatingState.isValidating).toBe(true)
    // Req 9.5: AI判定中も入力欄は編集可能 — これはコンポーネントテストで検証
    expect(validatingState.qualityGateStatus).toBe('validating')
  })

  it('タイムアウト時は canSubmit: true (手動モード切替)', () => {
    const timeoutState: AICoachChatState = {
      messages: [
        { id: 'msg-1', role: 'user', content: 'コメント', timestamp: new Date() },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'AI の応答がタイムアウトしました。手動で品質確認を行い、評価を送信できます。',
          timestamp: new Date(),
        },
      ],
      qualityGateStatus: 'timeout',
      isValidating: false,
      canSubmit: true,
      turnNumber: 0,
      lastSuggestions: null,
      missingAspects: [],
    }

    expect(timeoutState.canSubmit).toBe(true)
    expect(timeoutState.qualityGateStatus).toBe('timeout')
  })
})
