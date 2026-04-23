import { NextResponse } from 'next/server'
import { getDepartments } from '@/lib/employees/employee-directory'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ departments: getDepartments() })
}
