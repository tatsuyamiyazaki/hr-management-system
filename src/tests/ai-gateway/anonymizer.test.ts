import { describe, it, expect } from 'vitest'
import { anonymize, deanonymize } from '@/lib/ai-gateway/anonymizer'

describe('anonymize', () => {
  it('replaces a single fullName with emp_001', () => {
    const result = anonymize({
      text: '田中太郎さんの評価を行います。',
      employees: [{ id: 'u1', fullName: '田中太郎' }],
    })

    expect(result.text).toBe('emp_001さんの評価を行います。')
    expect(result.map.tokens.get('田中太郎')).toBe('emp_001')
  })

  it('uses the same token for repeated occurrences of the same fullName', () => {
    const result = anonymize({
      text: '田中太郎。また田中太郎。',
      employees: [{ id: 'u1', fullName: '田中太郎' }],
    })

    expect(result.text).toBe('emp_001。またemp_001。')
  })

  it('replaces employeeCode along with fullName using the same token per employee', () => {
    const result = anonymize({
      text: '田中太郎 (E-0001) の評価',
      employees: [{ id: 'u1', fullName: '田中太郎', employeeCode: 'E-0001' }],
    })

    expect(result.text).toContain('emp_001')
    expect(result.text).not.toContain('田中太郎')
    expect(result.text).not.toContain('E-0001')
    expect(result.map.tokens.get('E-0001')).toBe('emp_001')
  })

  it('replaces emails with [EMAIL_REDACTED] when no employee mapping provided', () => {
    const result = anonymize({
      text: 'Contact: tanaka@example.com please',
    })

    expect(result.text).toBe('Contact: [EMAIL_REDACTED] please')
  })

  it('replaces phone numbers with [PHONE_REDACTED]', () => {
    const result = anonymize({
      text: '電話番号は 03-1234-5678 です',
    })

    expect(result.text).toContain('[PHONE_REDACTED]')
    expect(result.text).not.toContain('03-1234-5678')
  })

  it('replaces generic employee codes with [CODE_REDACTED] when not in the map', () => {
    const result = anonymize({
      text: '社員番号 E-9999 の件',
    })

    expect(result.text).toBe('社員番号 [CODE_REDACTED] の件')
  })

  it('assigns sequential tokens for multiple employees', () => {
    const result = anonymize({
      text: '田中太郎と山田花子のミーティング',
      employees: [
        { id: 'u1', fullName: '田中太郎' },
        { id: 'u2', fullName: '山田花子' },
      ],
    })

    expect(result.text).toBe('emp_001とemp_002のミーティング')
    expect(result.map.tokens.get('田中太郎')).toBe('emp_001')
    expect(result.map.tokens.get('山田花子')).toBe('emp_002')
  })

  it('prefers explicit employee email over the redaction pattern', () => {
    const result = anonymize({
      text: '連絡先: tanaka@example.com と yamada@example.com',
      employees: [
        { id: 'u1', fullName: '田中太郎', email: 'tanaka@example.com' },
        { id: 'u2', fullName: '山田花子' },
      ],
    })

    expect(result.text).toContain('emp_001')
    expect(result.text).toContain('[EMAIL_REDACTED]')
    expect(result.text).not.toContain('tanaka@example.com')
  })

  it('handles empty text safely', () => {
    const result = anonymize({ text: '' })
    expect(result.text).toBe('')
    expect(result.map.tokens.size).toBe(0)
  })

  it('handles input without employees (returns only pattern redactions)', () => {
    const result = anonymize({ text: '問い合わせは info@example.com まで' })
    expect(result.text).toBe('問い合わせは [EMAIL_REDACTED] まで')
    expect(result.map.tokens.size).toBe(0)
  })

  it('ignores employees with missing fields without producing stray tokens in the map', () => {
    const result = anonymize({
      text: '田中太郎の件',
      employees: [
        { id: 'u1', fullName: '田中太郎' },
        { id: 'u2' }, // no identifying fields
      ],
    })

    expect(result.text).toBe('emp_001の件')
    // u2 は原文に一致する値を提供しないため、置換マップには現れない
    expect(Array.from(result.map.tokens.values())).toEqual(['emp_001'])
  })

  it('does not over-replace: "田中" inside "田中一郎" stays intact when only full name is registered', () => {
    const result = anonymize({
      text: '田中太郎さんと田中一郎さんは別人です',
      employees: [{ id: 'u1', fullName: '田中太郎' }],
    })

    expect(result.text).toBe('emp_001さんと田中一郎さんは別人です')
  })
})

describe('deanonymize', () => {
  it('restores tokens back to the original names', () => {
    const { text, map } = anonymize({
      text: '田中太郎と山田花子',
      employees: [
        { id: 'u1', fullName: '田中太郎' },
        { id: 'u2', fullName: '山田花子' },
      ],
    })

    expect(deanonymize(text, map)).toBe('田中太郎と山田花子')
  })

  it('returns empty string unchanged', () => {
    expect(deanonymize('', { tokens: new Map() })).toBe('')
  })

  it('leaves REDACTED placeholders untouched (irreversible)', () => {
    const { text, map } = anonymize({ text: '連絡先 info@example.com' })
    expect(deanonymize(text, map)).toBe('連絡先 [EMAIL_REDACTED]')
  })
})
