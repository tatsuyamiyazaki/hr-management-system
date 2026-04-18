/**
 * Task 6.5 / Req 1.10: InvitationService の単体テスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInvitationService } from '@/lib/auth/invitation-service'
import { createInMemoryInvitationTokenRepository } from '@/lib/auth/invitation-token-repository'
import { createInMemoryAuthUserRepository } from '@/lib/auth/user-repository'
import {
  EmailAlreadyExistsError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  INVITATION_TTL_MS,
} from '@/lib/auth/invitation-types'
import { PasswordPolicyViolationError } from '@/lib/auth/auth-types'
import type { PasswordHasher } from '@/lib/auth/password-hasher'
import type { InvitationEmailSender } from '@/lib/auth/invitation-service'

const APP_SECRET = 'test-secret-32-chars-long-enough!!'

function makeHasher(overrides?: Partial<PasswordHasher>): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    verify: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
}

function makeEmailSender(): InvitationEmailSender {
  return { sendInvitationEmail: vi.fn().mockResolvedValue(undefined) }
}

const NOW = new Date('2026-04-18T10:00:00.000Z')

function makeService({
  tokenId = 'token-uuid',
  userId = 'user-uuid',
  clock = () => NOW,
  emailSender = makeEmailSender(),
  hasher = makeHasher(),
} = {}) {
  const tokens = createInMemoryInvitationTokenRepository()
  const users = createInMemoryAuthUserRepository()
  const svc = createInvitationService({
    tokens,
    users,
    passwordHasher: hasher,
    emailSender,
    appSecret: APP_SECRET,
    userIdFactory: () => userId,
    tokenFactory: () => tokenId,
    clock,
  })
  return { svc, tokens, users, emailSender, hasher }
}

// ─────────────────────────────────────────────────────────────────────────────
// inviteUser
// ─────────────────────────────────────────────────────────────────────────────

describe('InvitationService.inviteUser', () => {
  it('新規ユーザーの招待が成功する', async () => {
    const { svc, tokens, users, emailSender } = makeService()

    await svc.inviteUser({ email: 'alice@example.com', role: 'EMPLOYEE' }, 'admin-1')

    // PENDING_JOIN ユーザーが作成されている
    const user = await users.findById('user-uuid')
    expect(user?.status).toBe('PENDING_JOIN')
    expect(user?.role).toBe('EMPLOYEE')

    // トークンが作成されている
    const token = await tokens.findByToken('token-uuid')
    expect(token).not.toBeNull()
    expect(token?.email).toBe('alice@example.com')
    expect(token?.usedAt).toBeNull()

    // 招待メールが送信されている
    expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com', token: 'token-uuid' }),
    )
  })

  it('招待トークンの expiresAt は 72 時間後', async () => {
    const { svc, tokens } = makeService()
    await svc.inviteUser({ email: 'bob@example.com', role: 'MANAGER' }, 'admin-1')

    const token = await tokens.findByToken('token-uuid')
    expect(token?.expiresAt.getTime()).toBe(NOW.getTime() + INVITATION_TTL_MS)
  })

  it('同じメールアドレスが既存の場合は EmailAlreadyExistsError', async () => {
    const { svc } = makeService()
    await svc.inviteUser({ email: 'alice@example.com', role: 'EMPLOYEE' }, 'admin-1')

    await expect(
      svc.inviteUser({ email: 'alice@example.com', role: 'HR_MANAGER' }, 'admin-1'),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsError)
  })

  it('invitedByUserId がトークンに保存される', async () => {
    const { svc, tokens } = makeService()
    await svc.inviteUser({ email: 'carol@example.com', role: 'ADMIN' }, 'admin-99')

    const token = await tokens.findByToken('token-uuid')
    expect(token?.invitedByUserId).toBe('admin-99')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// acceptInvitation
// ─────────────────────────────────────────────────────────────────────────────

describe('InvitationService.acceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function setupInvited() {
    const ctx = makeService()
    await ctx.svc.inviteUser({ email: 'alice@example.com', role: 'EMPLOYEE' }, 'admin-1')
    return ctx
  }

  it('有効なトークンでパスワードを設定するとアカウントが ACTIVE になる', async () => {
    const { svc, users } = await setupInvited()

    await svc.acceptInvitation('token-uuid', 'ValidPass1!extra', NOW)

    const user = await users.findById('user-uuid')
    expect(user?.status).toBe('ACTIVE')
    expect(user?.passwordHash).toBe('$2b$12$hashed')
  })

  it('acceptInvitation 後にトークンが使用済みになる', async () => {
    const { svc, tokens } = await setupInvited()
    await svc.acceptInvitation('token-uuid', 'ValidPass1!extra', NOW)

    const token = await tokens.findByToken('token-uuid')
    expect(token?.usedAt).toEqual(NOW)
  })

  it('存在しないトークンは InvitationNotFoundError', async () => {
    const { svc } = makeService()
    await expect(
      svc.acceptInvitation('no-such-token', 'ValidPass1!extra', NOW),
    ).rejects.toBeInstanceOf(InvitationNotFoundError)
  })

  it('有効期限切れのトークンは InvitationExpiredError', async () => {
    const { svc } = await setupInvited()
    const afterExpiry = new Date(NOW.getTime() + INVITATION_TTL_MS + 1)

    await expect(
      svc.acceptInvitation('token-uuid', 'ValidPass1!extra', afterExpiry),
    ).rejects.toBeInstanceOf(InvitationExpiredError)
  })

  it('使用済みトークンは InvitationAlreadyUsedError', async () => {
    const { svc } = await setupInvited()
    await svc.acceptInvitation('token-uuid', 'ValidPass1!extra', NOW)

    await expect(
      svc.acceptInvitation('token-uuid', 'AnotherPass2!extra', NOW),
    ).rejects.toBeInstanceOf(InvitationAlreadyUsedError)
  })

  it('パスワードが短い場合は PasswordPolicyViolationError (LENGTH)', async () => {
    const { svc } = await setupInvited()
    await expect(svc.acceptInvitation('token-uuid', 'Short1!', NOW)).rejects.toBeInstanceOf(
      PasswordPolicyViolationError,
    )
  })

  it('パスワードが複雑性要件を満たさない場合は PasswordPolicyViolationError (COMPLEXITY)', async () => {
    const { svc } = await setupInvited()
    await expect(
      svc.acceptInvitation('token-uuid', 'alllowercaseonly123', NOW),
    ).rejects.toBeInstanceOf(PasswordPolicyViolationError)
  })
})
