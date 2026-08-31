/**
 * Pinch (grab) detection from MediaPipe hand landmarks.
 *
 * Geometry, not a learned gesture model: thumb-to-index distance, normalized
 * by wrist-to-middle-knuckle so the threshold is depth- and scale-invariant
 * (a hand close to the camera and a hand far away pinch at the same ratio).
 * Hysteresis (different close/open thresholds) plus an N-frame debounce
 * stop the state flickering when fingers hover near the boundary.
 */

const THUMB_TIP = 4
const INDEX_TIP = 8
const WRIST = 0
const MIDDLE_MCP = 9

const CLOSE_THRESHOLD = 0.32
const OPEN_THRESHOLD = 0.45
const DEBOUNCE_FRAMES = 3

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))
}

/** 0 = fingertips touching, larger = hand open. Scale/depth-invariant. */
export function pinchRatio(landmarks) {
  const scale = dist3(landmarks[WRIST], landmarks[MIDDLE_MCP]) || 1e-6
  return dist3(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / scale
}

/**
 * Index fingertip in [0,1] image space, x-mirrored to match the mirrored
 * video the user actually sees (Feed.css flips the camera preview for a
 * natural, non-selfie-reversed feel; the overlay must flip the same way
 * or the cursor and the video would visibly disagree).
 */
export function cursorFromLandmarks(landmarks) {
  const tip = landmarks[INDEX_TIP]
  return [1 - tip.x, tip.y]
}

/**
 * Returns a stateful `update(landmarks | null)` function. One tracker per
 * active hand-tracking session — construct fresh when Live Hand mode starts.
 */
export function createPinchTracker() {
  let pinching = false
  let pendingState = null
  let pendingFrames = 0

  return function update(landmarks) {
    if (!landmarks) {
      pendingState = null
      pendingFrames = 0
      return { pinching, ratio: null, cursor: null, margin: 0 }
    }

    const ratio = pinchRatio(landmarks)
    const cursor = cursorFromLandmarks(landmarks)
    const wantPinch = pinching ? ratio < OPEN_THRESHOLD : ratio < CLOSE_THRESHOLD

    if (wantPinch !== pinching) {
      if (wantPinch === pendingState) {
        pendingFrames += 1
      } else {
        pendingState = wantPinch
        pendingFrames = 1
      }
      if (pendingFrames >= DEBOUNCE_FRAMES) {
        pinching = wantPinch
        pendingState = null
        pendingFrames = 0
      }
    } else {
      pendingState = null
      pendingFrames = 0
    }

    // How far past the active threshold we are, 0..1 — feeds confidence.
    const threshold = pinching ? OPEN_THRESHOLD : CLOSE_THRESHOLD
    const margin = Math.max(0, Math.min(1, Math.abs(ratio - threshold) / threshold))

    return { pinching, ratio, cursor, margin }
  }
}
