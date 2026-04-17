import { describe, it, expect } from 'vitest'
import { createInMemoryFeatureFlagStore } from '@/lib/ai-monitoring/feature-flag-store'

describe('createInMemoryFeatureFlagStore', () => {
  it('defaults all features to enabled when no seed', async () => {
    const store = createInMemoryFeatureFlagStore()
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(true)
    expect(await store.isEnabled('FEEDBACK_TRANSFORM')).toBe(true)
    expect(await store.listDisabled()).toEqual([])
  })

  it('accepts seed of initially-disabled features', async () => {
    const store = createInMemoryFeatureFlagStore(['FEEDBACK_SUMMARY'])
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(false)
    expect(await store.isEnabled('FEEDBACK_TRANSFORM')).toBe(true)
  })

  it('disable() flips a feature off and is idempotent', async () => {
    const store = createInMemoryFeatureFlagStore()
    await store.disable('FEEDBACK_SUMMARY')
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(false)

    // Idempotent: second call does not throw or flip state.
    await store.disable('FEEDBACK_SUMMARY')
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(false)
  })

  it('enable() flips a feature on and is idempotent', async () => {
    const store = createInMemoryFeatureFlagStore(['FEEDBACK_SUMMARY'])
    await store.enable('FEEDBACK_SUMMARY')
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(true)

    // Idempotent.
    await store.enable('FEEDBACK_SUMMARY')
    expect(await store.isEnabled('FEEDBACK_SUMMARY')).toBe(true)
  })

  it('listDisabled returns all currently disabled features', async () => {
    const store = createInMemoryFeatureFlagStore()
    await store.disable('FEEDBACK_SUMMARY')
    await store.disable('FEEDBACK_TRANSFORM')
    const disabled = await store.listDisabled()
    expect([...disabled].sort()).toEqual(['FEEDBACK_SUMMARY', 'FEEDBACK_TRANSFORM'])

    await store.enable('FEEDBACK_TRANSFORM')
    const remaining = await store.listDisabled()
    expect(remaining).toEqual(['FEEDBACK_SUMMARY'])
  })
})
