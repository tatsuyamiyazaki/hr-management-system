/**
 * Issue #29 / Req 14.9: 遉ｾ蜩｡ CSV 荳諡ｬ繧､繝ｳ繝昴・繝・API
 *
 * POST /api/lifecycle/employees/import
 * - ADMIN 縺ｾ縺溘・ HR_MANAGER 縺ｮ縺ｿ螳溯｡悟庄閭ｽ
 * - multipart/form-data 縺ｧ `file` 繝輔ぅ繝ｼ繝ｫ繝会ｼ・SV・峨ｒ蜿励￠蜿悶ｋ
 * - BulkImportResult 繧定ｿ泌唆
 *   - 蜈ｨ莉ｶ謌仙粥: 201
 *   - 驛ｨ蛻・､ｱ謨・ 207 Multi-Status
 * - 422 / 413 / 401 / 403 / 503 縺ｯ蜈ｱ騾・
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getLifecycleService } from '@/lib/lifecycle/lifecycle-service-di'

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_ROLES = new Set<string>(['ADMIN', 'HR_MANAGER'])
const STATUS_MULTI_STATUS = 207
const STATUS_CREATED = 201

interface AuthorizedSession {
  readonly userId: string
}

function authorize(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
): { ok: true; session: AuthorizedSession } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!role || !ALLOWED_ROLES.has(role) || !userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session: { userId } }
}

async function extractCsvFile(
  request: NextRequest,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; response: NextResponse }> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid multipart/form-data body' }, { status: 400 }),
    }
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'file field is required' }, { status: 422 }),
    }
  }
  if (file.size === 0) {
    return { ok: false, response: NextResponse.json({ error: 'file is empty' }, { status: 422 }) }
  }
  if (file.size > MAX_CSV_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `file exceeds ${MAX_CSV_BYTES} bytes` },
        { status: 413 },
      ),
    }
  }

  const arrayBuf = await file.arrayBuffer()
  return { ok: true, buffer: Buffer.from(arrayBuf) }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authorize(await getAppSession())
  if (!auth.ok) return auth.response

  const fileResult = await extractCsvFile(request)
  if (!fileResult.ok) return fileResult.response

  let svc: ReturnType<typeof getLifecycleService>
  try {
    svc = getLifecycleService()
  } catch {
    return NextResponse.json({ error: 'Lifecycle service not initialized' }, { status: 503 })
  }

  try {
    const result = await svc.bulkImportUsers(fileResult.buffer, auth.session.userId)
    const status = result.failureCount === 0 ? STATUS_CREATED : STATUS_MULTI_STATUS
    return NextResponse.json(
      {
        totalRows: result.totalRows,
        successCount: result.successCount,
        failureCount: result.failureCount,
        errors: result.errors,
        jobId: result.jobId,
      },
      { status },
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
