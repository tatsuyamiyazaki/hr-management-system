import { NextResponse, type NextRequest } from 'next/server'

const MAX_CSV_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 422 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 422 })
  }

  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MAX_CSV_BYTES} bytes` }, { status: 413 })
  }

  return NextResponse.json({
    totalRows: 0,
    successCount: 0,
    failureCount: 0,
    fileName: file.name,
  })
}
