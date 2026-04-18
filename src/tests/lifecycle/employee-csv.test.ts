/**
 * Issue #29 / Req 14.9: employee-csv.ts の単体テスト
 *
 * - 正常ケース
 * - 必須フィールド欠如
 * - role 不正
 * - 日付形式不正
 * - 重複 email
 */
import { describe, it, expect } from 'vitest'
import { parseEmployeeCsv } from '@/lib/lifecycle/employee-csv'

const HEADER = 'email,firstName,lastName,role,hireDate,departmentId,positionId'

describe('parseEmployeeCsv()', () => {
  describe('正常ケース', () => {
    it('ヘッダー + 1 行を解釈する', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(errors).toEqual([])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        rowNumber: 2,
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Anderson',
        role: 'EMPLOYEE',
        departmentId: 'dept-001',
        positionId: 'pos-001',
      })
      expect(rows[0]?.hireDate.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    })

    it('複数行を解釈する', () => {
      const csv =
        `${HEADER}\n` +
        'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
        'bob@example.com,Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n'
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(errors).toEqual([])
      expect(rows).toHaveLength(2)
      expect(rows[1]?.role).toBe('MANAGER')
    })

    it('空行をスキップする', () => {
      const csv =
        `${HEADER}\n` +
        'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
        '\n' +
        '   ,,,,,,\n' +
        'bob@example.com,Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n'
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(errors).toEqual([])
      expect(rows).toHaveLength(2)
    })
  })

  describe('必須フィールド欠如', () => {
    it('email が空ならエラー', () => {
      const csv = `${HEADER}\n,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'email')).toBe(true)
      expect(errors[0]?.rowNumber).toBe(2)
    })

    it('firstName が空ならエラー', () => {
      const csv = `${HEADER}\nalice@example.com,,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'firstName')).toBe(true)
    })

    it('lastName が空ならエラー', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,,EMPLOYEE,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'lastName')).toBe(true)
    })

    it('departmentId が空ならエラー', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'departmentId')).toBe(true)
    })

    it('positionId が空ならエラー', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'positionId')).toBe(true)
    })

    it('複数フィールド欠如は複数エラー', () => {
      const csv = `${HEADER}\n,,,,2026-04-01,,\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      const fields = new Set(errors.map((e) => e.field))
      expect(fields.has('email')).toBe(true)
      expect(fields.has('firstName')).toBe(true)
      expect(fields.has('lastName')).toBe(true)
    })
  })

  describe('email 形式不正', () => {
    it('@ が無い email はエラー', () => {
      const csv = `${HEADER}\nnot-an-email,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      const emailErr = errors.find((e) => e.field === 'email')
      expect(emailErr?.message).toContain('不正')
    })
  })

  describe('role 不正', () => {
    it('未知の role はエラー', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,INTERN,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      const roleErr = errors.find((e) => e.field === 'role')
      expect(roleErr).toBeDefined()
      expect(roleErr?.message).toContain('ADMIN')
    })

    it('大文字小文字違いは不可', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,employee,2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'role')).toBe(true)
    })

    it.each(['ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'])('%s は受け入れる', (role) => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,${role},2026-04-01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(errors).toEqual([])
      expect(rows[0]?.role).toBe(role)
    })
  })

  describe('日付形式不正', () => {
    it('YYYY/MM/DD は不可', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026/04/01,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'hireDate')).toBe(true)
    })

    it('日時付き (ISO datetime) は不可', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01T00:00:00Z,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'hireDate')).toBe(true)
    })

    it('存在しない日付 (2026-02-30) は不可', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,2026-02-30,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'hireDate')).toBe(true)
    })

    it('空文字列はエラー', () => {
      const csv = `${HEADER}\nalice@example.com,Alice,Anderson,EMPLOYEE,,dept-001,pos-001\n`
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors.some((e) => e.field === 'hireDate')).toBe(true)
    })
  })

  describe('重複 email', () => {
    it('同一 CSV 内で重複した email は 2 件目以降がエラー', () => {
      const csv =
        `${HEADER}\n` +
        'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
        'bob@example.com,Bob,Brown,MANAGER,2025-10-15,dept-002,pos-002\n' +
        'alice@example.com,Alice2,Anderson2,EMPLOYEE,2026-05-01,dept-003,pos-003\n'
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(2)
      const dupErr = errors.find((e) => e.field === 'email' && e.rowNumber === 4)
      expect(dupErr?.message).toContain('重複')
    })

    it('大文字小文字違いも重複とみなす', () => {
      const csv =
        `${HEADER}\n` +
        'alice@example.com,Alice,Anderson,EMPLOYEE,2026-04-01,dept-001,pos-001\n' +
        'ALICE@example.com,Alice2,Anderson2,EMPLOYEE,2026-05-01,dept-003,pos-003\n'
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(1)
      expect(errors.some((e) => e.field === 'email' && e.rowNumber === 3)).toBe(true)
    })
  })

  describe('ヘッダーエラー', () => {
    it('ヘッダーが不正なら行データは処理しない', () => {
      const csv = 'foo,bar,baz\nrow1,row2,row3\n'
      const { rows, errors } = parseEmployeeCsv(csv)
      expect(rows).toHaveLength(0)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.rowNumber).toBe(1)
    })

    it('空入力はヘッダーエラー', () => {
      const { rows, errors } = parseEmployeeCsv('')
      expect(rows).toHaveLength(0)
      expect(errors).toHaveLength(1)
    })
  })
})
