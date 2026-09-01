import { useEffect, useRef, useState } from 'react'
import { useHandTracker } from '../perception/handTracker'
import { createPinchTracker } from '../perception/pinch'
import { createInteraction } from '../perception/interaction'
import { BOX_SIZE, CONTAINER, OBJECT_DEFS, ZONES } from '../perception/scene'
import './HandStage.css'

/**
 * The Live Hand overlay: hand tracking + the virtual scene, drawn on a
 * canvas above the live camera feed.
 *
 * Follows the same pattern as the existing Demo Replay canvas — its own
 * requestAnimationFrame loop reading refs directly, not React state, so
 * ~30 hand detections a second never trigger a React re-render. Only the
 * ActionEvents this produces (via onAction) touch React/the backend.
 *
 * videoRef must point at the *already playing* camera <video> element
 * that Feed renders; this component only adds the overlay on top of it.
 */
export default function HandStage({ videoRef, active, emitEnabled, onAction }) {
  const canvasRef = useRef(null)
  const { status: trackerStatus, error, handRef } = useHandTracker(videoRef, active)
  const pinchRef = useRef(createPinchTracker())
  const emitEnabledRef = useRef(emitEnabled)
  const onActionRef = useRef(onAction)
  emitEnabledRef.current = emitEnabled
  onActionRef.current = onAction

  const interactionRef = useRef(
    createInteraction({ onAction: (action, confidence) => {
      if (emitEnabledRef.current) onActionRef.current(action, confidence)
    } })
  )
  const [handPresent, setHandPresent] = useState(false)

  // Reset the interaction FSM to a clean slate each time Live Hand mode
  // (re)activates, so a previous run's held/placed objects don't linger.
  useEffect(() => {
    if (active) {
      pinchRef.current = createPinchTracker()
      interactionRef.current = createInteraction({
        onAction: (action, confidence) => {
          if (emitEnabledRef.current) onActionRef.current(action, confidence)
        },
      })
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      ctx.clearRect(0, 0, W, H)

      const hand = handRef.current
      const pinch = pinchRef.current(hand?.landmarks ?? null)
      const scene = interactionRef.current.update(pinch)

      setHandPresentThrottled(performance.now(), !!hand)

      drawContainer(ctx, W, H, scene.containerOpen)
      drawZones(ctx, W, H, pinch, scene)
      drawObjects(ctx, W, H, scene)
      if (pinch.cursor) drawCursor(ctx, W, H, pinch)

      raf = requestAnimationFrame(draw)
    }

    // Throttle the handPresent React-state update to ~4/sec — it only
    // drives a text label, not the drawing loop.
    let lastPresentUpdate = 0
    function setHandPresentThrottled(now, present) {
      if (now - lastPresentUpdate > 250) {
        lastPresentUpdate = now
        setHandPresent(present)
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active, handRef])

  if (!active) return null

  return (
    <>
      <canvas ref={canvasRef} className="hand-stage-canvas" />
      <div className="hand-stage-status">
        {trackerStatus === 'loading' && <span className="eyebrow">Loading hand-tracking model…</span>}
        {trackerStatus === 'error' && (
          <span className="eyebrow hand-stage-status--error">Hand tracking unavailable{error ? `: ${error}` : ''}</span>
        )}
        {trackerStatus === 'ready' && !handPresent && (
          <span className="eyebrow">Show your hand to the camera</span>
        )}
        {trackerStatus === 'ready' && handPresent && (
          <span className="eyebrow hand-stage-status--ok">Hand tracking</span>
        )}
      </div>
    </>
  )
}

/* ── drawing helpers — plain canvas, matching the Demo Replay visual language ── */

function drawContainer(ctx, W, H, open) {
  const x = CONTAINER.x * W
  const y = CONTAINER.y * H
  const w = CONTAINER.w * W
  const h = CONTAINER.h * H

  ctx.strokeStyle = 'rgba(18,43,71,0.7)'
  ctx.lineWidth = 1.75
  // A whisper of orbital blue rather than plain white — this is controlled
  // payload hardware, not a generic UI box.
  ctx.fillStyle = open ? 'rgba(27,86,168,0.05)' : 'rgba(27,86,168,0.09)'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 6)
  ctx.fill()
  ctx.setLineDash(open ? [5, 4] : [])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(18,43,71,0.8)'
  ctx.font = `600 ${Math.max(9, W * 0.011)}px "IBM Plex Mono", monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`PAYLOAD CONTAINER — ${open ? 'OPEN' : 'CLOSED · tap to open'}`, x, y - h / 2 - 8)
}

function drawZones(ctx, W, H, pinch, scene) {
  for (const zone of ZONES) {
    const x = zone.x * W
    const y = zone.y * H
    const r = zone.r * W

    const hovering =
      scene.held &&
      pinch.pinching &&
      pinch.cursor &&
      Math.hypot(pinch.cursor[0] * W - x, pinch.cursor[1] * H - y) < r

    // An object genuinely resting here (not being carried) means the target
    // is filled — checked against real interaction state, not assumed.
    const occupied = Object.entries(scene.positions).some(([id, p]) => {
      if (scene.held === id) return false
      return Math.hypot(p.x * W - x, p.y * H - y) < r * 0.7
    })

    // Steel while idle (structural, not yet engaged); cyan the moment the
    // live hand is genuinely over it; aurora green once something has
    // actually come to rest here — three real states, not a decoration.
    const color = occupied
      ? 'rgba(20,122,92,0.85)'
      : hovering
        ? 'rgba(3,125,146,0.9)'
        : 'rgba(92,114,144,0.55)'
    ctx.setLineDash(occupied ? [] : [4, 4])
    ctx.strokeStyle = color
    ctx.lineWidth = hovering || occupied ? 2.25 : 1.75
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Reticle ticks — the same targeting idiom Demo Replay's canvas uses,
    // so a target zone reads identically in both feed modes.
    const tick = Math.max(3.5, W * 0.006)
    const gap = tick * 0.7
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color
    ;[[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
      ctx.beginPath()
      ctx.moveTo(x + dx * (r + gap), y + dy * (r + gap))
      ctx.lineTo(x + dx * (r + gap + tick), y + dy * (r + gap + tick))
      ctx.stroke()
    })

    ctx.fillStyle = 'rgba(92,114,144,0.85)'
    ctx.font = `600 ${Math.max(9, W * 0.0095)}px "IBM Plex Mono", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`TARGET · ${zone.label}`, x, y + r + 15)
  }
}

function drawObjects(ctx, W, H, scene) {
  if (!scene.containerOpen) return
  const size = BOX_SIZE * W
  for (const def of OBJECT_DEFS) {
    const p = scene.positions[def.id]
    const x = p.x * W
    const y = p.y * H
    const isHeld = scene.held === def.id
    const s = isHeld ? size * 1.15 : size

    if (isHeld) {
      // Tracking indicator — a thin cyan ring around a genuinely carried
      // object, distinct from the object's own colour.
      ctx.strokeStyle = 'rgba(3,125,146,0.7)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(x, y, s * 0.82, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.shadowColor = 'rgba(18,43,71,0.4)'
      ctx.shadowBlur = 16
      ctx.shadowOffsetY = 5
    }
    ctx.fillStyle = def.color
    ctx.strokeStyle = def.edge
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.roundRect(x - s / 2, y - s / 2, s, s, 4)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.roundRect(x - s / 2 + 3, y - s / 2 + 3, s * 0.4, s * 0.28, 2)
    ctx.fill()
  }
}

// This cursor is the one thing on screen that is genuinely live-tracked
// (real landmarks, this frame) rather than known-by-construction or
// scripted, so it is the one place cyan marks a literal tracking indicator.
function drawCursor(ctx, W, H, pinch) {
  const x = pinch.cursor[0] * W
  const y = pinch.cursor[1] * H
  const r = pinch.pinching ? 7 : 10

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = pinch.pinching ? 'rgba(3,125,146,0.88)' : 'rgba(3,125,146,0.18)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(3,125,146,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!pinch.pinching) {
    ctx.strokeStyle = 'rgba(3,125,146,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15); ctx.stroke()
  }
}
