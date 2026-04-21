import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import type { MyTeamResponse } from '@/lib/organization/organization-types'

type MyTeamRole = 'MANAGER' | 'HR_MANAGER' | 'ADMIN'

function isMyTeamRole(value: unknown): value is MyTeamRole {
  return value === 'MANAGER' || value === 'HR_MANAGER' || value === 'ADMIN'
}

function isDevelopmentMyTeamFallbackEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false
  }

  return process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_AUTH_BYPASS === '1'
}

function buildDevelopmentMyTeamResponse(userId: string, role: MyTeamRole): MyTeamResponse {
  return {
    managerId: userId,
    managerName: process.env.DEV_AUTH_NAME ?? 'Development User',
    departmentName: role === 'MANAGER' ? 'Engineering' : 'People Operations',
    directReports: [
      {
        userId: 'team-user-1',
        name: 'Aiko Tanaka',
        email: 'aiko.tanaka@example.com',
        roleName: 'Senior Engineer',
        departmentName: 'Engineering',
      },
      {
        userId: 'team-user-2',
        name: 'Shota Sato',
        email: 'shota.sato@example.com',
        roleName: 'Product Designer',
        departmentName: 'Design',
      },
      {
        userId: 'team-user-3',
        name: 'Mina Suzuki',
        email: 'mina.suzuki@example.com',
        roleName: 'Sales Associate',
        departmentName: 'Sales',
      },
    ],
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = session as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const role = sess.role
  if (!userId || !isMyTeamRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isDevelopmentMyTeamFallbackEnabled()) {
    return NextResponse.json(buildDevelopmentMyTeamResponse(userId, role), { status: 200 })
  }

  return NextResponse.json({ error: 'My team API is not implemented' }, { status: 501 })
}
