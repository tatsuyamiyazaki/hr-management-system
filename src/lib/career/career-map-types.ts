/**
 * Issue #40 / Req 5.1, 5.3, 5.4: キャリアマップとギャップ表示の型定義
 */

export interface SkillRequirement {
  skillId: string
  skillName: string
  requiredLevel: number
}

export interface RoleNode {
  id: string
  name: string
  skillRequirements: SkillRequirement[]
}

export interface SkillGapItem {
  skillId: string
  skillName: string
  requiredLevel: number
  actualLevel: number
  gap: number
}

export interface CareerGapResult {
  currentRoleId: string | null
  desiredRoleId: string
  gaps: SkillGapItem[]
  totalGap: number
  fulfillmentRate: number
}

export interface SubordinateWish {
  userId: string
  userName?: string
  currentRoleId: string | null
  desiredRoleId: string
  desiredRoleName: string
  desiredAt: Date
  fulfillmentRate: number
}
