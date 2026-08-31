/**
 * The virtual experiment scene.
 *
 * Object and zone geometry live here, in normalized [0,1] display-space
 * coordinates — the same space the mirrored camera and the hand cursor
 * occupy, so nothing here depends on rendered pixel size.
 *
 * These objects are virtual on purpose: their position is known by
 * construction, so there is no perception problem to solve for them. The
 * only thing perceived in this stage is the hand. See
 * docs/PERCEPTION-PLAN.md §4-6 for what changes when the objects become
 * physical (colour segmentation, fiducials, or a trained detector).
 */

export const CONTAINER = { id: 'CONTAINER', x: 0.5, y: 0.26, w: 0.34, h: 0.15 }

export const OBJECT_DEFS = [
  { id: 'RED_BOX', color: '#c0392b', edge: '#922b21', shelfX: 0.5 - 0.09 },
  { id: 'YELLOW_BOX', color: '#d4ac0d', edge: '#9a7d0a', shelfX: 0.5 },
  { id: 'BLUE_BOX', color: '#2471a3', edge: '#1a5276', shelfX: 0.5 + 0.09 },
]

export const BOX_SIZE = 0.065

export const ZONES = [
  { id: 'RED_MARKER', label: 'RED', x: 0.28, y: 0.72, r: 0.075 },
  { id: 'YELLOW_MARKER', label: 'YELLOW', x: 0.72, y: 0.72, r: 0.075 },
]

export function shelfPosition(def) {
  return { x: def.shelfX, y: CONTAINER.y }
}

/** Point-in-rect hit test against the container footprint (the open/close
 * tap affordance — OPEN_CONTAINER/CLOSE_CONTAINER have no transport
 * semantics, so they get a tap rather than a drag). */
export function hitContainer(cursor) {
  const [cx, cy] = cursor
  const dx = Math.abs(cx - CONTAINER.x) / (CONTAINER.w / 2)
  const dy = Math.abs(cy - CONTAINER.y) / (CONTAINER.h / 2)
  return dx <= 1 && dy <= 1
}

/**
 * Point-in-rect hit test against live object positions. Returns the
 * nearest-to-centre match (by margin) so overlapping objects don't fight.
 */
export function hitObject(cursor, positions, objectIds) {
  const [cx, cy] = cursor
  let best = null
  let bestMargin = -Infinity
  for (const id of objectIds) {
    const p = positions[id]
    const dx = Math.abs(cx - p.x) / (BOX_SIZE / 2)
    const dy = Math.abs(cy - p.y) / (BOX_SIZE / 2)
    const margin = 1 - Math.max(dx, dy)
    if (margin >= 0 && margin > bestMargin) {
      best = id
      bestMargin = margin
    }
  }
  return best ? { id: best, margin: bestMargin } : null
}

/** Point-in-circle hit test against placement zones. Zones deliberately
 * accept ANY object here — perception reports what happened, it never
 * judges whether the object belongs there. That is the procedure engine's
 * job, and it is the only place "wrong object" gets decided. */
export function hitZone(cursor) {
  const [cx, cy] = cursor
  let best = null
  let bestMargin = -Infinity
  for (const zone of ZONES) {
    const d = Math.hypot(cx - zone.x, cy - zone.y)
    const margin = 1 - d / zone.r
    if (margin >= 0 && margin > bestMargin) {
      best = zone
      bestMargin = margin
    }
  }
  return best ? { zone: best, margin: bestMargin } : null
}
