import { assertPasswordStrong } from './password-policy'
import type { InvitationService } from './invitation-service'
import {
  EmailAlreadyExistsError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  type InviteUserInput,
} from './invitation-types'

interface DevInvitationRecord {
  readonly token: string
  readonly email: string
  readonly role: InviteUserInput['role']
  readonly invitedByUserId: string
  readonly createdAt: Date
  readonly expiresAt: Date
  usedAt: Date | null
}

class DevInvitationService implements InvitationService {
  private readonly records = new Map<string, DevInvitationRecord>()
  private tokenSequence = 0

  constructor() {
    const now = new Date()
    this.records.set('demo-invite-admin', {
      token: 'demo-invite-admin',
      email: 'new.member@example.com',
      role: 'EMPLOYEE',
      invitedByUserId: 'dev-admin',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 70 * 60 * 60 * 1000),
      usedAt: null,
    })
  }

  async inviteUser(input: InviteUserInput, invitedByUserId: string): Promise<void> {
    const normalizedEmail = input.email.trim().toLowerCase()
    const exists = Array.from(this.records.values()).some(
      (record) => record.email.trim().toLowerCase() === normalizedEmail,
    )

    if (exists) {
      throw new EmailAlreadyExistsError()
    }

    this.tokenSequence += 1
    const createdAt = new Date()
    const token = `invite-${String(this.tokenSequence).padStart(4, '0')}`

    this.records.set(token, {
      token,
      email: input.email,
      role: input.role,
      invitedByUserId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 72 * 60 * 60 * 1000),
      usedAt: null,
    })
  }

  async acceptInvitation(token: string, password: string, now = new Date()): Promise<void> {
    const record = this.records.get(token)
    if (!record) {
      throw new InvitationNotFoundError(token)
    }
    if (record.usedAt) {
      throw new InvitationAlreadyUsedError()
    }
    if (now > record.expiresAt) {
      throw new InvitationExpiredError()
    }

    assertPasswordStrong(password)
    record.usedAt = new Date(now)
  }
}

let devInvitationService: InvitationService | null = null

export function getDevInvitationService(): InvitationService {
  if (!devInvitationService) {
    devInvitationService = new DevInvitationService()
  }
  return devInvitationService
}
