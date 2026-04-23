import { NextResponse, type NextRequest } from 'next/server'
import { listEmployees, type EmployeeStatus } from '@/lib/employees/employee-directory'

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseStatus(value: string | null): EmployeeStatus | undefined {
  if (
    value === 'ACTIVE' ||
    value === 'ON_LEAVE' ||
    value === 'PARENTAL_LEAVE' ||
    value === 'RESIGNED'
  ) {
    return value
  }
  return undefined
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const result = listEmployees({
    page: parsePositiveInt(searchParams.get('page')),
    limit: parsePositiveInt(searchParams.get('limit')),
    departmentId: searchParams.get('departmentId') || undefined,
    status: parseStatus(searchParams.get('status')),
  })

  return NextResponse.json(result)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  return NextResponse.json(
    {
      id: `employee-${Date.now()}`,
      ...body,
    },
    { status: 201 },
  )
}
