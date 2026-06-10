import type { LatLng } from '../components/map/types'

/**
 * Geo helpers for the quests.location_point geography(Point, 4326) column.
 * - Writes: EWKT string (PostgREST casts text -> geography).
 * - Reads: PostgREST returns geography as WKB hex; parse it back to LatLng.
 */

/** EWKT for inserts/updates, e.g. "SRID=4326;POINT(-3.7038 40.4168)" */
export function toEwktPoint({ lat, lng }: LatLng): string {
  return `SRID=4326;POINT(${lng} ${lat})`
}

const WKB_POINT = 1
const WKB_SRID_FLAG = 0x20000000
const WKB_Z_FLAG = 0x80000000

/**
 * Parse a (E)WKB hex string for a 2D point, as returned by PostgREST for
 * geography columns (e.g. "0101000020E6100000…"). Returns null for
 * anything that isn't a parseable point.
 */
export function parseWkbHexPoint(value: unknown): LatLng | null {
  if (typeof value !== 'string' || value.length < 42) return null
  if (!/^[0-9a-fA-F]+$/.test(value)) return null

  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16)
  }
  const view = new DataView(bytes.buffer)

  const littleEndian = bytes[0] === 1
  const rawType = view.getUint32(1, littleEndian)
  if ((rawType & 0xff) !== WKB_POINT) return null
  if ((rawType & WKB_Z_FLAG) !== 0) return null // 3D points unsupported

  let offset = 5
  if ((rawType & WKB_SRID_FLAG) !== 0) {
    offset += 4 // skip SRID
  }
  if (bytes.length < offset + 16) return null

  const lng = view.getFloat64(offset, littleEndian)
  const lat = view.getFloat64(offset + 8, littleEndian)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  return { lat, lng }
}

/** URL-safe slug from a title, with a random suffix for uniqueness. */
export function questSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
  const suffix = Math.random().toString(36).slice(2, 8)
  return base ? `${base}-${suffix}` : `quest-${suffix}`
}
