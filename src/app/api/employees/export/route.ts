import { NextResponse, type NextRequest } from 'next/server'
import { exportEmployeesCsv, type EmployeeStatus } from '@/lib/employees/employee-directory'

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
  const csv = exportEmployeesCsv({
    departmentId: searchParams.get('departmentId') || undefined,
    status: parseStatus(searchParams.get('status')),
  })

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="employees.csv"',
    },
  })
}
