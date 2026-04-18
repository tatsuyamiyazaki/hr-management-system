/**
 * Issue #27 / Req 3.4: 純粋関数 detectCycle の単体テスト
 */
import { describe, it, expect } from 'vitest'
import { detectCycle, type ParentMap } from '@/lib/organization/cycle-detection'

function mapOf(entries: Array<[string, string | null]>): ParentMap {
  return new Map(entries)
}

describe('detectCycle', () => {
  it('空マップはサイクルなし', () => {
    expect(detectCycle(mapOf([]))).toEqual({ ok: true })
  })

  it('1ノードがルート (parent=null) のみのケースはサイクルなし', () => {
    expect(detectCycle(mapOf([['a', null]]))).toEqual({ ok: true })
  })

  it('直列の親子関係 a<-b<-c はサイクルなし', () => {
    expect(
      detectCycle(
        mapOf([
          ['c', 'b'],
          ['b', 'a'],
          ['a', null],
        ]),
      ),
    ).toEqual({ ok: true })
  })

  it('自己参照 a->a は循環として検出される', () => {
    const result = detectCycle(mapOf([['a', 'a']]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.path).toEqual(['a', 'a'])
  })

  it('2ノードの循環 a->b->a を検出する', () => {
    const result = detectCycle(
      mapOf([
        ['a', 'b'],
        ['b', 'a'],
      ]),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.path).toContain('a')
      expect(result.path).toContain('b')
    }
  })

  it('部分木が独立にある場合もサイクルがなければ ok', () => {
    expect(
      detectCycle(
        mapOf([
          ['a', null],
          ['b', 'a'],
          ['x', null],
          ['y', 'x'],
        ]),
      ),
    ).toEqual({ ok: true })
  })

  it('一部だけがサイクルを含むなら検出される', () => {
    const result = detectCycle(
      mapOf([
        ['root', null],
        ['a', 'root'],
        ['b', 'c'],
        ['c', 'b'],
      ]),
    )
    expect(result.ok).toBe(false)
  })
})
