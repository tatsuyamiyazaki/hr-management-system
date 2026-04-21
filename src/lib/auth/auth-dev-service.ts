import type { AuthService } from './auth-service'
import type { Session } from './auth-types'
import { SessionNotFoundError } from './auth-types'

const CURRENT_SESSION_ID = '00000000-0000-4000-8000-000000000001'

function cloneSession(session: Session): Session {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    lastAccessAt: new Date(session.lastAccessAt),
  }
}

function buildSeedSessions(): Session[] {
  const now = new Date()
  const oneHour = 60 * 60 * 1000

  return [
    {
      id: CURRENT_SESSION_ID,
      userId: 'dev-admin',
      role: 'ADMIN',
      email: 'dev.admin@example.com',
      createdAt: new Date(now.getTime() - 20 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 8 * oneHour),
      lastAccessAt: new Date(now.getTime() - 2 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'Chrome / Local Desktop',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      userId: 'dev-admin',
      role: 'ADMIN',
      email: 'dev.admin@example.com',
      createdAt: new Date(now.getTime() - 2 * oneHour),
      expiresAt: new Date(now.getTime() + 6 * oneHour),
      lastAccessAt: new Date(now.getTime() - 45 * 60 * 1000),
      ipAddress: '192.168.0.12',
      userAgent: 'Safari on iPhone',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      userId: 'dev-admin',
      role: 'ADMIN',
      email: 'dev.admin@example.com',
      createdAt: new Date(now.getTime() - 26 * oneHour),
      expiresAt: new Date(now.getTime() + oneHour),
      lastAccessAt: new Date(now.getTime() - 3 * oneHour),
      ipAddress: '10.0.0.25',
      userAgent: 'Edge on Windows',
    },
  ]
}

class DevAuthService implements AuthService {
  private readonly sessions = new Map<string, Session>()

  constructor() {
    for (const session of buildSeedSessions()) {
      this.sessions.set(session.id, cloneSession(session))
    }
  }

  async login(): Promise<Session> {
    return cloneSession(this.sessions.get(CURRENT_SESSION_ID)!)
  }

  async logout(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async getSession(sessionId: string): Promise<Session> {
    const found = this.sessions.get(sessionId)
    if (!found) {
      throw new SessionNotFoundError(sessionId)
    }
    return cloneSession(found)
  }

  async touchSession(sessionId: string): Promise<Session> {
    const found = await this.getSession(sessionId)
    const updated: Session = { ...found, lastAccessAt: new Date() }
    this.sessions.set(sessionId, cloneSession(updated))
    return cloneSession(updated)
  }

  async listSessions(userId: string): Promise<readonly Session[]> {
    return Array.from(this.sessions.values())
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((session) => cloneSession(session))
  }

  async revokeSession(requesterId: string, sessionId: string): Promise<void> {
    const found = this.sessions.get(sessionId)
    if (!found || found.userId !== requesterId) {
      throw new SessionNotFoundError(sessionId)
    }
    this.sessions.delete(sessionId)
  }
}

let devAuthService: AuthService | null = null

export function getDevAuthService(): AuthService {
  if (!devAuthService) {
    devAuthService = new DevAuthService()
  }
  return devAuthService
}
