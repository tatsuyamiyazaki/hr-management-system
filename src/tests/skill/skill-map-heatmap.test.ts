import { describe, expect, it } from 'vitest'
import { normalizeSkillHeatmapData } from '@/lib/skill/skill-map-heatmap'

describe('normalizeSkillHeatmapData', () => {
  it('maps API departments to page teams', () => {
    const result = normalizeSkillHeatmapData({
      departments: ['Engineering'],
      categories: ['Backend'],
      cells: [{ team: 'Engineering', category: 'Backend', fulfillmentRate: 92 }],
    })

    expect(result.teams).toEqual(['Engineering'])
    expect(result.categories).toEqual(['Backend'])
    expect(result.cells).toHaveLength(1)
  })

  it('uses empty arrays when optional collections are missing', () => {
    const result = normalizeSkillHeatmapData({ totalMembers: 12 })

    expect(result).toEqual({
      teams: [],
      categories: [],
      cells: [],
      totalMembers: 12,
    })
  })

  it('returns fallback data when payload is nullish', () => {
    const fallback = {
      teams: ['Fallback'],
      categories: ['Design'],
      cells: [],
      totalMembers: 1,
    }

    expect(normalizeSkillHeatmapData(undefined, fallback)).toEqual(fallback)
  })
})
