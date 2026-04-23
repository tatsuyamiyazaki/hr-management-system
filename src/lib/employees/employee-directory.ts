export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'PARENTAL_LEAVE' | 'RESIGNED'

export interface Employee {
  readonly id: string
  readonly employeeNumber: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly departmentId: string
  readonly departmentName: string
  readonly roleId: string
  readonly roleName: string
  readonly grade: string
  readonly joinDate: string
  readonly status: EmployeeStatus
  readonly avatarColor: string
}

export interface Department {
  readonly id: string
  readonly name: string
  readonly employeeCount: number
}

export interface EmployeeListQuery {
  readonly page?: number
  readonly limit?: number
  readonly departmentId?: string
  readonly status?: EmployeeStatus
}

export interface EmployeeListResult {
  readonly employees: readonly Employee[]
  readonly total: number
  readonly page: number
  readonly limit: number
}

export const EMPLOYEE_DIRECTORY_SUMMARY = {
  activeEmployees: 1248,
  departments: 48,
  roles: 32,
} as const

const TOTAL_EMPLOYEES = 1248
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 24

const DEPARTMENT_NAMES = [
  'プロダクト本部',
  'エンジニアリング部',
  'デザイン部',
  'セールス本部',
  'カスタマーサクセス部',
  'マーケティング部',
  '人事部',
  '経理部',
  '法務部',
  '情報システム部',
  '事業企画部',
  '経営管理部',
] as const

const ROLE_NAMES = [
  'プロダクトマネージャー',
  'フロントエンドエンジニア',
  'バックエンドエンジニア',
  'デザイナー',
  'セールス',
  'カスタマーサクセス',
  '人事企画',
  '経理担当',
  '法務担当',
  '情シス担当',
  '事業企画',
  '経営企画',
  'データアナリスト',
  'QAエンジニア',
  'SRE',
  '採用担当',
  '労務担当',
  '広報',
  'インサイドセールス',
  'フィールドセールス',
  'サポート',
  'UIデザイナー',
  'UXリサーチャー',
  'テックリード',
  'エンジニアリングマネージャー',
  'スクラムマスター',
  'アカウントマネージャー',
  '事業責任者',
  '財務担当',
  '内部監査',
  'セキュリティ担当',
  '総務担当',
] as const

const FIRST_NAMES = [
  '太郎',
  '花子',
  '健太',
  '美咲',
  '翔',
  '葵',
  '悠真',
  '結衣',
  '蓮',
  '陽菜',
] as const

const LAST_NAMES = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
] as const

const GRADES = ['L3', 'L4', 'L5', 'M1', 'M2', 'M3'] as const
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
] as const

function getDepartmentId(index: number): string {
  const slug = [
    'product',
    'engineering',
    'design',
    'sales',
    'success',
    'marketing',
    'hr',
    'finance',
    'legal',
    'it',
    'planning',
    'corporate',
  ][index]
  return `dept-${slug}`
}

function createEmployee(index: number): Employee {
  const zeroBased = index - 1
  const departmentIndex = zeroBased % DEPARTMENT_NAMES.length
  const roleIndex = zeroBased % ROLE_NAMES.length
  const firstName = FIRST_NAMES[zeroBased % FIRST_NAMES.length] ?? FIRST_NAMES[0]
  const lastName =
    LAST_NAMES[Math.floor(zeroBased / FIRST_NAMES.length) % LAST_NAMES.length] ?? LAST_NAMES[0]
  const employeeNumber = `EMP-${String(index).padStart(5, '0')}`
  const status: EmployeeStatus =
    index % 41 === 0
      ? 'RESIGNED'
      : index % 29 === 0
        ? 'ON_LEAVE'
        : index % 23 === 0
          ? 'PARENTAL_LEAVE'
          : 'ACTIVE'

  return {
    id: `employee-${String(index).padStart(5, '0')}`,
    employeeNumber,
    firstName,
    lastName,
    email: `${employeeNumber.toLowerCase()}@example.com`,
    departmentId: getDepartmentId(departmentIndex),
    departmentName: DEPARTMENT_NAMES[departmentIndex] ?? DEPARTMENT_NAMES[0],
    roleId: `role-${String(roleIndex + 1).padStart(2, '0')}`,
    roleName: ROLE_NAMES[roleIndex] ?? ROLE_NAMES[0],
    grade: GRADES[zeroBased % GRADES.length] ?? GRADES[0],
    joinDate: `20${String(12 + (zeroBased % 13)).padStart(2, '0')}-${String((zeroBased % 12) + 1).padStart(2, '0')}-${String((zeroBased % 27) + 1).padStart(2, '0')}`,
    status,
    avatarColor: AVATAR_COLORS[zeroBased % AVATAR_COLORS.length] ?? AVATAR_COLORS[0],
  }
}

const EMPLOYEES: readonly Employee[] = Array.from({ length: TOTAL_EMPLOYEES }, (_, index) =>
  createEmployee(index + 1),
)

function clampPage(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value < 1) return DEFAULT_PAGE
  return Math.floor(value)
}

function clampLimit(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value < 1) return DEFAULT_LIMIT
  return Math.min(100, Math.floor(value))
}

export function getDepartments(): readonly Department[] {
  return DEPARTMENT_NAMES.map((name, index) => {
    const id = getDepartmentId(index)
    return {
      id,
      name,
      employeeCount: EMPLOYEES.filter((employee) => employee.departmentId === id).length,
    }
  })
}

export function listEmployees(query: EmployeeListQuery = {}): EmployeeListResult {
  const page = clampPage(query.page)
  const limit = clampLimit(query.limit)
  const filtered = EMPLOYEES.filter((employee) => {
    const matchesDepartment = !query.departmentId || employee.departmentId === query.departmentId
    const matchesStatus = !query.status || employee.status === query.status
    return matchesDepartment && matchesStatus
  })
  const offset = (page - 1) * limit

  return {
    employees: filtered.slice(offset, offset + limit),
    total: filtered.length,
    page,
    limit,
  }
}

function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

export function exportEmployeesCsv(query: EmployeeListQuery = {}): string {
  const rows = listEmployees({ ...query, page: 1, limit: 100 }).employees
  const header = [
    '社員番号',
    '氏名',
    'メールアドレス',
    '部署',
    '役職',
    '等級',
    '入社日',
    'ステータス',
  ]
  const body = rows.map((employee) =>
    [
      employee.employeeNumber,
      `${employee.lastName} ${employee.firstName}`,
      employee.email,
      employee.departmentName,
      employee.roleName,
      employee.grade,
      employee.joinDate,
      employee.status,
    ]
      .map(escapeCsv)
      .join(','),
  )
  return [header.join(','), ...body].join('\n')
}
