import { describe, expect, it } from 'vitest'
import {
  exportEmployeesCsv,
  getDepartments,
  listEmployees,
} from '@/lib/employees/employee-directory'

describe('employee directory', () => {
  it('returns the first 24 employees and total count by default', () => {
    const result = listEmployees({ page: 1, limit: 24 })

    expect(result.total).toBe(1248)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(24)
    expect(result.employees).toHaveLength(24)
    expect(result.employees[0]?.employeeNumber).toMatch(/^EMP-\d{5}$/)
  })

  it('filters employees by department and paginates within the filtered result', () => {
    const departments = getDepartments()
    const engineering = departments.find((department) => department.name === 'エンジニアリング部')

    expect(engineering).toBeDefined()

    const result = listEmployees({
      page: 2,
      limit: 24,
      departmentId: engineering?.id,
    })

    expect(result.total).toBe(engineering?.employeeCount)
    expect(result.page).toBe(2)
    expect(result.employees).toHaveLength(24)
    expect(result.employees.every((employee) => employee.departmentId === engineering?.id)).toBe(
      true,
    )
  })

  it('exports visible employee rows as CSV with escaped values', () => {
    const csv = exportEmployeesCsv({ departmentId: 'dept-sales', status: 'ACTIVE' })

    expect(csv).toContain('社員番号,氏名,メールアドレス,部署,役職,等級,入社日,ステータス')
    expect(csv).toContain('セールス本部')
    expect(csv).not.toContain('プロダクト本部')
  })
})
