import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findDuplicates,
  normalizeTitle,
  rapidSubmitters,
  stalePending,
  type InsightRow,
} from '../src/lib/moderationInsights'

const NOW = Date.parse('2026-07-05T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function row(overrides: Partial<InsightRow>): InsightRow {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Yard Sale on Court St',
    status: 'published',
    created_at: hoursAgo(1),
    created_by: 'user-1',
    lat: 46.23,
    lng: -119.1,
    ...overrides,
  }
}

test('normalizeTitle strips punctuation/case/whitespace', () => {
  assert.equal(normalizeTitle('  Yard-Sale!!  on COURT st. '), 'yardsale on court st')
})

test('duplicates: same title nearby groups; far apart does not', () => {
  const a = row({ id: 'a', lat: 46.23, lng: -119.1 })
  const b = row({ id: 'b', lat: 46.2301, lng: -119.1001 }) // ~15 m away
  const far = row({ id: 'far', lat: 46.9, lng: -119.9 }) // ~far away
  const groups = findDuplicates([a, b, far])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].rows.map((r) => r.id).sort(), ['a', 'b'])
})

test('duplicates: different titles never group', () => {
  const a = row({ id: 'a', title: 'Multi-family sale' })
  const b = row({ id: 'b', title: 'Concert at the park' })
  assert.equal(findDuplicates([a, b]).length, 0)
})

test('stalePending: only pending rows older than the window, oldest first', () => {
  const fresh = row({ id: 'fresh', status: 'pending_review', created_at: hoursAgo(2) })
  const old1 = row({ id: 'old1', status: 'pending_review', created_at: hoursAgo(24 * 10) })
  const old2 = row({ id: 'old2', status: 'pending_review', created_at: hoursAgo(24 * 20) })
  const published = row({ id: 'pub', status: 'published', created_at: hoursAgo(24 * 30) })
  const stale = stalePending([fresh, old1, old2, published], 7, NOW)
  assert.deepEqual(stale.map((r) => r.id), ['old2', 'old1'])
})

test('rapidSubmitters: flags >=4 submissions inside 24h, ignores older activity', () => {
  const spam = Array.from({ length: 5 }, (_, i) =>
    row({ id: `s${i}`, created_by: 'spammer', created_at: hoursAgo(i + 1) }),
  )
  const slow = Array.from({ length: 5 }, (_, i) =>
    row({ id: `n${i}`, created_by: 'normal', created_at: hoursAgo(30 + i * 24) }),
  )
  const flagged = rapidSubmitters([...spam, ...slow], 4, 24, NOW)
  assert.equal(flagged.length, 1)
  assert.equal(flagged[0].created_by, 'spammer')
  assert.equal(flagged[0].count, 5)
})
