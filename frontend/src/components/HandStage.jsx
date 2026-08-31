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

  ctx.strokeStyle = 'rgba(22,50,79,0.55)'
  ctx.lineWidth = 1.5
  ctx.fillStyle = open ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 6)
  ctx.fill()
  ctx.setLineDash(open ? [5, 4] : [])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(22,50,79,0.65)'
  ctx.font = `500 ${Math.max(9, W * 0.011)}px "IBM Plex Mono", monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`CONTAINER — ${open ? 'OPEN' : 'CLOSED · tap to open'}`, x, y - h / 2 - 8)
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

    ctx.setLineDash([4, 4])
    ctx.strokeStyle = hovering ? 'rgba(22,50,79,0.75)' : 'rgba(22,50,79,0.3)'
    ctx.lineWidth = hovering ? 2 : 1.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(22,50,79,0.55)'
    ctx.font = `500 ${Math.max(8, W * 0.009)}px "IBM Plex Mono", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(zone.label, x, y + r + 14)
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
    const s = isHeld ? size * 1.12 : size

    if (isHeld) {
      ctx.shadowColor = 'rgba(22,50,79,0.35)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 4
    }
    ctx.fillStyle = def.color
    ctx.strokeStyle = def.edge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - s / 2, y - s / 2, s, s, 4)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.roundRect(x - s / 2 + 3, y - s / 2 + 3, s * 0.4, s * 0.28, 2)
    ctx.fill()
  }
}

function drawCursor(ctx, W, H, pinch) {
  const x = pinch.cursor[0] * W
  const y = pinch.cursor[1] * H
  const r = pinch.pinching ? 7 : 10

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = pinch.pinching ? 'rgba(22,50,79,0.85)' : 'rgba(22,50,79,0.16)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(22,50,79,0.65)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!pinch.pinching) {
    ctx.strokeStyle = 'rgba(22,50,79,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15); ctx.stroke()
  }
}
