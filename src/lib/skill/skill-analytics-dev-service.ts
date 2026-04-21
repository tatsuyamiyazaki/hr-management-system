import {
  createSkillAnalyticsService,
  type EmployeeRow,
  type EmployeeSkillRow,
  type SkillAnalyticsRepository,
  type SkillAnalyticsService,
  type SkillMasterRow,
} from './skill-analytics-service'

const skillMasters: readonly SkillMasterRow[] = [
  { id: 'skill-ts', name: 'TypeScript', category: 'language', deprecated: false },
  { id: 'skill-react', name: 'React', category: 'frontend', deprecated: false },
  { id: 'skill-aws', name: 'AWS', category: 'cloud', deprecated: false },
  { id: 'skill-sql', name: 'SQL', category: 'data', deprecated: false },
]

const employees: readonly EmployeeRow[] = [
  { userId: 'dev-user-1', departmentId: 'dept-eng', departmentName: 'Engineering' },
  { userId: 'dev-user-2', departmentId: 'dept-eng', departmentName: 'Engineering' },
  { userId: 'dev-user-3', departmentId: 'dept-sales', departmentName: 'Sales' },
]

const employeeSkills: readonly EmployeeSkillRow[] = [
  { id: 'es-1', userId: 'dev-user-1', skillId: 'skill-ts', level: 5, approved: true },
  { id: 'es-2', userId: 'dev-user-1', skillId: 'skill-react', level: 4, approved: true },
  { id: 'es-3', userId: 'dev-user-1', skillId: 'skill-aws', level: 3, approved: true },
  { id: 'es-4', userId: 'dev-user-2', skillId: 'skill-ts', level: 3, approved: true },
  { id: 'es-5', userId: 'dev-user-2', skillId: 'skill-sql', level: 2, approved: false },
  { id: 'es-6', userId: 'dev-user-3', skillId: 'skill-react', level: 2, approved: true },
  { id: 'es-7', userId: 'dev-user-3', skillId: 'skill-sql', level: 4, approved: true },
]

const repository: SkillAnalyticsRepository = {
  async listEmployeeSkills(): Promise<EmployeeSkillRow[]> {
    return [...employeeSkills]
  },
  async listEmployeeSkillsByUser(userId: string): Promise<EmployeeSkillRow[]> {
    return employeeSkills.filter((skill) => skill.userId === userId)
  },
  async listSkillMasters(): Promise<SkillMasterRow[]> {
    return [...skillMasters]
  },
  async listEmployeesWithDepartment(): Promise<EmployeeRow[]> {
    return [...employees]
  },
  async countActiveEmployees(): Promise<number> {
    return employees.length
  },
}

export function createDevelopmentSkillAnalyticsService(): SkillAnalyticsService {
  return createSkillAnalyticsService(repository)
}
