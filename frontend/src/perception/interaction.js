/**
 * The hand-object interaction FSM.
 *
 * This is the ONLY module allowed to emit an ActionEvent. It owns the
 * container's open/closed state and which object (if any) is currently
 * held, and turns pinch + hit-test geometry into PICK_/PLACE_/OPEN_/CLOSE_
 * events — the same events a scripted scenario or a future physical-object
 * pipeline would produce.
 *
 * PERCEPTION REPORTS. PROCEDURE ENGINE JUDGES.
 * This module never asks "was that correct" — it only decides, from
 * geometry, what physically happened. A pick of the wrong box is reported
 * as a pick; the procedure engine is what calls it wrong.
 *
 * Every demo beat (correct, wrong object, wrong action, skipped step, late
 * recovery) falls out of this alone, with no special-casing:
 *   - wrong object  -> grab the blue box instead of red
 *   - wrong action  -> drop red in empty space, then pick it up again
 *                      before placing it (PICK where PLACE was expected)
 *   - skipped step  -> pick+place yellow before ever touching red
 *   - late recovery -> go back and pick+place red afterwards
 */
import { BOX_SIZE, CONTAINER, OBJECT_DEFS, hitContainer, hitObject, hitZone, shelfPosition } from './scene.js'

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

export function createInteraction({ onAction }) {
  let containerOpen = false
  let held = null // object id currently grabbed, or null
  let heldOffset = [0, 0]
  let pinchStartedOnContainer = false
  let wasPinching = false

  const positions = Object.fromEntries(OBJECT_DEFS.map((d) => [d.id, shelfPosition(d)]))

  function confidenceFrom(pinchMargin, hitMargin) {
    return Math.min(0.99, Math.max(0.5, 0.55 + 0.22 * clamp01(pinchMargin) + 0.22 * clamp01(hitMargin)))
  }

  function snapshot() {
    return {
      containerOpen,
      held,
      positions: { ...positions },
    }
  }

  /** Advance one frame. `pinch` is the output of pinch.js's tracker. */
  function update(pinch) {
    const { pinching, cursor, margin: pinchMargin } = pinch

    if (!cursor) {
      wasPinching = pinching
      return snapshot()
    }

    // ── pinch just started ──
    if (pinching && !wasPinching) {
      pinchStartedOnContainer = false
      if (containerOpen && !held) {
        const hit = hitObject(cursor, positions, OBJECT_DEFS.map((d) => d.id))
        if (hit) {
          held = hit.id
          const p = positions[held]
          heldOffset = [p.x - cursor[0], p.y - cursor[1]]
          onAction(`PICK_${held}`, confidenceFrom(pinchMargin, hit.margin))
        }
      }
      if (!held && hitContainer(cursor)) {
        pinchStartedOnContainer = true
      }
    }

    // ── pinch active: held object follows the cursor ──
    if (pinching && held) {
      positions[held] = { x: cursor[0] + heldOffset[0], y: cursor[1] + heldOffset[1] }
    }

    // ── pinch just released ──
    if (!pinching && wasPinching) {
      if (held) {
        const zoneHit = hitZone(cursor)
        if (zoneHit) {
          positions[held] = { x: zoneHit.zone.x, y: zoneHit.zone.y }
          onAction(`PLACE_${held}`, confidenceFrom(pinchMargin, zoneHit.margin))
        } else {
          // Released in empty space: the operator changed their mind.
          // That is a non-event, not an error - snap back and stay silent.
          const def = OBJECT_DEFS.find((d) => d.id === held)
          positions[held] = shelfPosition(def)
        }
        held = null
      } else if (pinchStartedOnContainer && hitContainer(cursor)) {
        containerOpen = !containerOpen
        onAction(containerOpen ? 'OPEN_CONTAINER' : 'CLOSE_CONTAINER', confidenceFrom(pinchMargin, 1))
      }
      pinchStartedOnContainer = false
    }

    wasPinching = pinching
    return snapshot()
  }

  return { update, snapshot }
}

export { CONTAINER, OBJECT_DEFS, BOX_SIZE }
