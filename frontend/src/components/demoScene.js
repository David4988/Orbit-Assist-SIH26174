/**
 * Demo Replay's scene model — pure geometry, no React and no canvas.
 *
 * Split out of Feed.jsx so it can be reasoned about and tested on its own,
 * the same way perception/ separates pinch and interaction logic from the
 * component that renders them.
 */

// Mirrors scenarios/demo_master.json. The real beats are fetched from
// /api/scenario/demo_master on mount; this is the offline fallback so the
// demo never depends on that request succeeding.
const FALLBACK_BEATS = [
  { t: 4.0, action: 'OPEN_CONTAINER' },
  { t: 14.0, action: 'PICK_BLUE_BOX' },
  { t: 24.0, action: 'PICK_RED_BOX' },
  { t: 34.0, action: 'PLACE_RED_BOX' },
  { t: 46.0, action: 'PLACE_YELLOW_BOX' },
  { t: 58.0, action: 'PICK_YELLOW_BOX' },
  { t: 72.0, action: 'CLOSE_CONTAINER' },
]

const TRAVEL = 5.5 // seconds of approach; the hand arrives exactly on the beat
const BOX = 18

/* What each observed action looks like on the bench.
     target — where the hand must be at the beat's timestamp
     via    — optional waypoint; the object only moves on the second leg
     lift   — the box is raised and carried by the hand from this beat
     push   — the box is shoved along the bench during the approach (no lift)
     rest   — the box comes to rest at this beat's target

   PLACE_YELLOW_BOX deliberately pushes rather than lifts. The engine reports
   step 4 ("pick up the yellow box") as SKIPPED at that moment, so the operator
   must not be seen picking it up — it is shoved out of the container onto the
   marker in one motion. The lift happens only at PICK_YELLOW_BOX, which is the
   beat that repairs the skipped step. */
const CHOREO = {
  OPEN_CONTAINER: { target: 'lid', open: true },
  CLOSE_CONTAINER: { target: 'lid', open: false },
  PICK_BLUE_BOX: { target: 'blueHome', lift: 'BLUE' },
  PICK_RED_BOX: { target: 'redHome', lift: 'RED' },
  PLACE_RED_BOX: { target: 'redMarker', rest: 'RED' },
  PLACE_YELLOW_BOX: { target: 'yellowMarker', via: 'yellowHome', push: 'YELLOW', rest: 'YELLOW' },
  PICK_YELLOW_BOX: { target: 'yellowMarker', lift: 'YELLOW' },
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p })

/** Bench geometry — every anchor the choreography can name. */
function stage(W, H) {
  const benchY = H * 0.65
  const cW = W * 0.28
  const cH = H * 0.22
  const cX = W * 0.5
  const cY = benchY - cH
  const markerR = 18
  const restY = benchY + 14
  return {
    W, H, benchY, cX, cY, cW, cH, markerR, restY,
    idle: { x: W * 0.5, y: H * 0.4 },
    lid: { x: cX, y: cY - 10 },
    redHome: { x: cX + 6, y: cY + cH * 0.4 },
    yellowHome: { x: cX - 8, y: cY + cH * 0.55 },
    blueHome: { x: W * 0.15, y: benchY - BOX },
    redMarker: { x: W * 0.72, y: restY },
    yellowMarker: { x: W * 0.26, y: restY },
  }
}

/** Does any beat from `from` onward bring `key` to rest? */
function hasLaterRest(beats, from, key) {
  for (let j = from; j < beats.length; j++) {
    const ch = CHOREO[beats[j].action]
    if (ch && ch.rest === key) return true
  }
  return false
}

/**
 * The entire scene at time t — derived from the beats, never from its own
 * independent timeline. This is the function that keeps the picture and the
 * narration describing the same action.
 */
function sceneAt(t, beats, g) {
  const boxes = {
    RED: { at: g.redHome, from: g.redHome, carried: false, out: false, liftIndex: null },
    YELLOW: { at: g.yellowHome, from: g.yellowHome, carried: false, out: false, liftIndex: null },
    // The blue distractor sits on the bench, not in the container, so it is
    // visible from the start.
    BLUE: { at: g.blueHome, from: g.blueHome, carried: false, out: true, liftIndex: null },
  }
  let open = false

  // Apply every beat whose moment has passed. liftIndex remembers WHICH beat
  // most recently lifted a box, so a box that is never rested again can be
  // released relative to that fixed beat rather than to "whatever the
  // current beat happens to be" — see the release pass below.
  let i = 0
  for (; i < beats.length && beats[i].t <= t; i++) {
    const ch = CHOREO[beats[i].action]
    if (!ch) continue
    if (ch.open !== undefined) open = ch.open
    if (ch.lift) {
      const b = boxes[ch.lift]
      b.from = b.at
      b.carried = true
      b.liftIndex = i
    }
    if (ch.rest) {
      const b = boxes[ch.rest]
      b.at = g[ch.target]
      b.carried = false
      b.liftIndex = null
      b.out = true
    }
  }

  // A box that is still marked carried here was lifted but never rested by
  // any later beat that has fired yet. If NOTHING in the whole future rests
  // it, it must be put back down — not "at the end of whichever beat is
  // currently next" (that pointer keeps moving as t advances into later
  // beats, which is what let a released box silently re-attach to the hand
  // at the start of every subsequent beat), but at a point anchored to its
  // OWN lift: the moment the hand would depart for the beat right after that
  // lift. Once dropped this way, liftIndex stays put and t only grows, so a
  // dropped box cannot re-attach at some later beat it has no event for.
  for (const key of Object.keys(boxes)) {
    const b = boxes[key]
    if (!b.carried || b.liftIndex == null) continue
    if (hasLaterRest(beats, b.liftIndex + 1, key)) continue // a real placement is still coming — stay carried
    const after = beats[b.liftIndex + 1]
    const releaseAt = after ? Math.max(0, after.t - TRAVEL) : Infinity
    if (t >= releaseAt) {
      b.carried = false
      b.at = b.from
    }
  }

  const next = i < beats.length ? beats[i] : null
  const prev = i > 0 ? beats[i - 1] : null
  const prevCh = prev ? CHOREO[prev.action] : null
  const prevPoint = prevCh ? g[prevCh.target] : g.idle

  let hand = prevPoint
  let pushing = null
  let pushP = 0

  if (next) {
    const ch = CHOREO[next.action] || {}
    const nextPoint = ch.target ? g[ch.target] : g.idle
    const depart = Math.max(0, next.t - TRAVEL)

    if (t > depart) {
      const p = ease(clamp01((t - depart) / (next.t - depart)))
      if (ch.via) {
        // Two legs: reach the object first, then move it to the target.
        const via = g[ch.via]
        if (p < 0.5) {
          hand = lerp(prevPoint, via, p / 0.5)
        } else {
          pushP = (p - 0.5) / 0.5
          hand = lerp(via, nextPoint, pushP)
          pushing = ch.push || null
        }
      } else {
        hand = lerp(prevPoint, nextPoint, p)
      }
    }
  } else {
    // No beats left at all: anything still carried (a lift with no beat
    // after it in the whole scenario) is set down where it came from.
    for (const key of Object.keys(boxes)) {
      const b = boxes[key]
      if (b.carried) {
        b.carried = false
        b.at = b.from
      }
    }
  }

  const resolved = {}
  for (const key of Object.keys(boxes)) {
    const b = boxes[key]
    let pos = b.at
    let lifted = false
    if (b.carried) {
      pos = hand
      lifted = true
    }
    if (pushing === key && next) {
      // Shoved just ahead of the hand along the bench, settling onto the
      // marker exactly as the beat fires. No lift, no shadow — this must not
      // read as a pick-up.
      const ch = CHOREO[next.action]
      const dir = Math.sign(g[ch.target].x - g[ch.via].x) || 1
      pos = { x: hand.x + dir * 10 * (1 - pushP), y: hand.y }
    }
    resolved[key] = { x: pos.x, y: pos.y, lifted, visible: open || b.out || b.carried }
  }

  return { open, hand, boxes: resolved }
}


export { FALLBACK_BEATS, TRAVEL, BOX, CHOREO, stage, sceneAt }
