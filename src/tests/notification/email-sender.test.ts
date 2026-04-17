import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createResendEmailSender } from '@/lib/notification/email-sender'

// ─────────────────────────────────────────────────────────────────────────────
// Resend SDK をモック
// ─────────────────────────────────────────────────────────────────────────────

const mockResendSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createResendEmailSender()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResendSend.mockReset()
  })

  it('should throw when apiKey is empty string', () => {
    expect(() => createResendEmailSender('')).toThrow(/RESEND_API_KEY/)
  })

  it('should throw when apiKey is whitespace only', () => {
    expect(() => createResendEmailSender('   ')).toThrow(/RESEND_API_KEY/)
  })

  it('should return a sender when apiKey is provided', () => {
    const sender = createResendEmailSender('test-api-key')
    expect(sender).toBeDefined()
    expect(typeof sender.send).toBe('function')
  })

  it('should call Resend.emails.send with correct arguments', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
    const sender = createResendEmailSender('test-api-key', 'from@example.com')

    await sender.send({
      to: 'user@example.com',
      subject: 'テスト件名',
      html: '<p>Hello</p>',
    })

    expect(mockResendSend).toHaveBeenCalledOnce()
    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'user@example.com',
      subject: 'テスト件名',
      html: '<p>Hello</p>',
    })
  })

  it('should allow per-call from override', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null })
    const sender = createResendEmailSender('test-api-key', 'default@example.com')

    await sender.send({
      from: 'override@example.com',
      to: 'user@example.com',
      subject: 'S',
      html: '<p>H</p>',
    })

    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'override@example.com' }),
    )
  })

  it('should throw when Resend returns an error result', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid from address' },
    })
    const sender = createResendEmailSender('test-api-key', 'from@example.com')

    await expect(
      sender.send({ to: 'user@example.com', subject: 'S', html: '<p>H</p>' }),
    ).rejects.toThrow(/Invalid from address/)
  })

  it('should propagate network errors from Resend client', async () => {
    mockResendSend.mockRejectedValue(new Error('network down'))
    const sender = createResendEmailSender('test-api-key', 'from@example.com')

    await expect(
      sender.send({ to: 'user@example.com', subject: 'S', html: '<p>H</p>' }),
    ).rejects.toThrow(/network down/)
  })
})
