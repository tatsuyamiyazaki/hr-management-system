export interface SkillMapHeatmapCell {
  readonly team: string
  readonly category: string
  readonly fulfillmentRate: number
}

export interface SkillMapHeatmapData {
  readonly teams: readonly string[]
  readonly categories: readonly string[]
  readonly cells: readonly SkillMapHeatmapCell[]
  readonly totalMembers: number
}

interface RawSkillMapHeatmapData {
  readonly teams?: readonly string[]
  readonly departments?: readonly string[]
  readonly categories?: readonly string[]
  readonly cells?: readonly SkillMapHeatmapCell[]
  readonly totalMembers?: number
}

const EMPTY_HEATMAP: SkillMapHeatmapData = {
  teams: [],
  categories: [],
  cells: [],
  totalMembers: 0,
}

export function normalizeSkillHeatmapData(
  payload: RawSkillMapHeatmapData | null | undefined,
  fallback: SkillMapHeatmapData = EMPTY_HEATMAP,
): SkillMapHeatmapData {
  if (!payload) return fallback

  return {
    teams: payload.teams ?? payload.departments ?? [],
    categories: payload.categories ?? [],
    cells: payload.cells ?? [],
    totalMembers: payload.totalMembers ?? fallback.totalMembers,
  }
}
