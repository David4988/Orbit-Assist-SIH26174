import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HandStage from './HandStage'
import { BOX, CHOREO, FALLBACK_BEATS, sceneAt, stage } from './demoScene'
import './Feed.css'

const EASE = [0.22, 1, 0.36, 1]

/* ─────────────────────────────────────────────────────────────────────────────
   Canvas Demo Replay Fallback

   A deterministic lab-bench animation used when no experiment.mp4 is present.
   It provides a genuine "something is being monitored" visual so Demo Replay
   mode is never just an empty standby placeholder.

   The scene is a pure function of (elapsed time, scenario beats). Every beat
   in scenarios/demo_master.json names an action; CHOREO below says where the
   hand must be when that action is observed and what it does to the objects.
   The hand always ARRIVES at a beat's target exactly at that beat's timestamp,
   so the animation, the emitted event, the procedure UI and the spoken
   guidance all describe the same action at the same instant.

   The clock is the same one Feed reports to the backend, so the animation
   cannot drift from the scenario player, and Reset rewinds both together.
───────────────────────────────────────────────────────────────────────────── */

function DemoCanvas({ clockRef, canvasRef }) {
  const animRef = useRef(null)
  const beatsRef = useRef(FALLBACK_BEATS)

  // Adopt the real scenario beats so the animation and the engine are driven
  // by one definition. Ignored unless every action can actually be staged.
  useEffect(() => {
    let cancelled = false
    fetch('/api/scenario/demo_master')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.events?.length) return
        if (d.events.every((e) => CHOREO[e.action])) {
          beatsRef.current = d.events.map((e) => ({ t: e.t, action: e.action }))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // Resize to container. setTransform, not scale — scale compounds every
    // time the window is resized mid-demo.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (now) => {
      const t = Math.max(0, clockRef.current)

      const W = canvas.offsetWidth
      const H = canvas.offsetHeight

      // ── background ──
      ctx.fillStyle = '#eceeea'
      ctx.fillRect(0, 0, W, H)

      // Grid lines — subtle graph-paper feel
      ctx.strokeStyle = 'rgba(160,165,155,0.35)'
      ctx.lineWidth = 1
      const GRID = 28
      for (let x = 0; x < W; x += GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // ── scene, derived from the scenario beats ──
      const g = stage(W, H)
      const scene = sceneAt(t, beatsRef.current, g)
      const { cX, cY, cW, cH, benchY: bY } = g

      // ── lab bench ──
      ctx.fillStyle = '#d4d8cf'
      ctx.fillRect(0, bY, W, H - bY)
      ctx.strokeStyle = '#b8bdb2'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, bY); ctx.lineTo(W, bY); ctx.stroke()

      // ── container / outer box ──
      const containerOpen = scene.open
      ctx.strokeStyle = '#8a9088'
      ctx.lineWidth = 2
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.beginPath()
      ctx.roundRect(cX - cW / 2, cY, cW, cH, 4)
      ctx.fill(); ctx.stroke()

      // lid
      if (!containerOpen) {
        ctx.fillStyle = '#b0b5ab'
        ctx.beginPath()
        ctx.roundRect(cX - cW / 2 - 2, cY - 8, cW + 4, 12, 3)
        ctx.fill(); ctx.stroke()
      } else {
        // open lid leaning back
        ctx.save()
        ctx.translate(cX - cW / 2, cY)
        ctx.rotate(-0.45)
        ctx.fillStyle = '#b0b5ab'
        ctx.beginPath()
        ctx.roundRect(0, -12, cW + 4, 12, 3)
        ctx.fill(); ctx.stroke()
        ctx.restore()
      }

      // label on container
      ctx.fillStyle = '#6b7068'
      ctx.font = `500 ${Math.max(8, W * 0.012)}px "IBM Plex Mono", monospace`
      ctx.textAlign = 'center'
      ctx.fillText('CONTAINER', cX, bY - 10)

      // ── placement markers ──
      const mR = g.markerR

      // Red marker
      ctx.strokeStyle = 'rgba(166,43,31,0.35)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(g.redMarker.x, g.redMarker.y + mR, mR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // Yellow marker
      ctx.strokeStyle = 'rgba(178,106,0,0.35)'
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(g.yellowMarker.x, g.yellowMarker.y + mR, mR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // ── hand cursor ──
      // Position comes straight from the beats, so the hand is always on the
      // object the current event names.
      const { x: hx, y: hy } = scene.hand
      if (t > 0) {
        ctx.beginPath()
        ctx.arc(hx, hy, 9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(22,50,79,0.18)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(22,50,79,0.55)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        // crosshair
        ctx.strokeStyle = 'rgba(22,50,79,0.55)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(hx - 14, hy); ctx.lineTo(hx + 14, hy); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(hx, hy - 14); ctx.lineTo(hx, hy + 14); ctx.stroke()
      }

      // ── small objects ──
      drawBox(ctx, scene.boxes.RED, '#c0392b', '#922b21')
      drawBox(ctx, scene.boxes.YELLOW, '#d4ac0d', '#9a7d0a')
      drawBox(ctx, scene.boxes.BLUE, '#2471a3', '#1a5276')

      // ── scan line overlay ──
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      const sl = ((now / 4000) % 1) * H
      grad.addColorStop(Math.max(0, (sl - 4) / H), 'rgba(0,0,0,0)')
      grad.addColorStop(sl / H, 'rgba(255,255,255,0.025)')
      grad.addColorStop(Math.min(1, (sl + 4) / H), 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // ── corner brackets ──
      const br = 16
      ctx.strokeStyle = 'rgba(22,50,79,0.4)'
      ctx.lineWidth = 1.5
      const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]
      corners.forEach(([cx, cy, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(cx + sx * br, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * br); ctx.stroke()
      })

      // ── timestamp ── the same clock the backend is being driven by, so it
      // always agrees with the "Elapsed" readout beside the procedure.
      const mm = String(Math.floor(t / 60)).padStart(2, '0')
      const ss = String(Math.floor(t % 60)).padStart(2, '0')
      ctx.fillStyle = 'rgba(22,50,79,0.5)'
      ctx.font = `500 ${Math.max(9, W * 0.014)}px "IBM Plex Mono", monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`${mm}:${ss}`, 16, H - 16)

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [canvasRef, clockRef])

  return null
}

/** One coloured box. Carried boxes are raised and shadowed; pushed boxes are
    deliberately not, so a shove never reads as a pick-up. */
function drawBox(ctx, box, fill, edge) {
  if (!box.visible) return
  const s = box.lifted ? BOX * 1.12 : BOX
  if (box.lifted) {
    ctx.shadowColor = 'rgba(22,50,79,0.35)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 4
  }
  ctx.fillStyle = fill
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(box.x - s / 2, box.y - s / 2, s, s, 3)
  ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.roundRect(box.x - s / 2 + 2, box.y - s / 2 + 2, s * 0.45, s * 0.3, 2)
  ctx.fill()
}

/* ─────────────────────────────────────────────────────────────────────────────
   Camera status states
───────────────────────────────────────────────────────────────────────────── */
// camState: 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable'

/* ─────────────────────────────────────────────────────────────────────────────
   Feed
   feedMode: 'replay' | 'camera'  — owned by App, passed as prop
   onClock: reports currentTime (seconds) to the WebSocket
   videoRef: the replay <video> element ref (owned by App for play/pause)
───────────────────────────────────────────────────────────────────────────── */
export default function Feed({ status, onClock, videoRef, lastEvent, feedMode, onFeedModeChange, onHandAction }) {
  // ── replay video state ──
  const [hasVideo, setHasVideo] = useState(null) // null = not yet tried
  const fallbackStart = useRef(null)
  // lastTRef persists across effect re-runs so pause→resume resumes from the
  // correct position rather than jumping forward by the pause duration.
  const lastTRef = useRef(-1)

  // ── camera state ──
  const [camState, setCamState] = useState('idle') // idle | requesting | active | denied | unavailable
  const streamRef = useRef(null)
  const camVideoRef = useRef(null)
  const canvasRef = useRef(null)

  // ── stop camera helper ──
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (camVideoRef.current) {
      camVideoRef.current.srcObject = null
    }
    setCamState('idle')
  }, [])

  // ── start camera ──
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('unavailable')
      return
    }
    setCamState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      streamRef.current = stream
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream
      }
      setCamState('active')
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCamState('denied')
      } else {
        setCamState('unavailable')
      }
    }
  }, [])

  // ── mode switching ──
  useEffect(() => {
    if (feedMode === 'camera') {
      // Only request if not already active/requesting
      if (camState === 'idle') {
        startCamera()
      }
    } else {
      // Switched away from camera — stop stream
      stopCamera()
    }
  }, [feedMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── attach stream to video element once both are ready ──
  useEffect(() => {
    if (camState === 'active' && camVideoRef.current && streamRef.current) {
      if (camVideoRef.current.srcObject !== streamRef.current) {
        camVideoRef.current.srcObject = streamRef.current
      }
    }
  }, [camState])

  // ── cleanup on unmount ──
  useEffect(() => () => stopCamera(), [stopCamera])

  // ── master clock loop ──
  useEffect(() => {
    const replayVideo = videoRef?.current
    let raf

    // When transitioning into 'running' (start or resume after pause), reset
    // fallbackStart so it is recalculated on the first tick using lastTRef as
    // the offset — this is what keeps the clock correct through pause/resume.
    // When resetting to 'idle', also clear lastTRef.
    if (status === 'running') {
      fallbackStart.current = null
    } else if (status === 'idle') {
      fallbackStart.current = null
      lastTRef.current = -1
    }

    const loop = () => {
      const now = performance.now() / 1000
      let t = null

      if (feedMode === 'replay') {
        // Prefer real video's currentTime (natural pause/resume for free).
        if (hasVideo === true && replayVideo && !Number.isNaN(replayVideo.duration)) {
          t = replayVideo.currentTime
        } else if (status === 'running') {
          // Wall-clock fallback: anchor from lastTRef so pause duration is excluded.
          if (fallbackStart.current == null) {
            fallbackStart.current = now - Math.max(lastTRef.current, 0)
          }
          t = now - fallbackStart.current
        }
      } else if (feedMode === 'camera') {
        // Camera mode: always wall clock (webcam feed is visual-only).
        if (status === 'running') {
          if (fallbackStart.current == null) {
            fallbackStart.current = now - Math.max(lastTRef.current, 0)
          }
          t = now - fallbackStart.current
        }
      }

      if (t != null && Math.abs(t - lastTRef.current) > 0.2) {
        lastTRef.current = t
        onClock(t)
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, onClock, hasVideo, status, feedMode])

  // ── determine what to show in the frame ──
  const showReplayVideo = feedMode === 'replay' && hasVideo === true
  const showReplayCanvas = feedMode === 'replay' && hasVideo === false
  const showCameraFeed = feedMode === 'camera' && camState === 'active'
  const showCameraRequest = feedMode === 'camera' && camState === 'idle'
  const showCameraConnecting = feedMode === 'camera' && camState === 'requesting'
  const showCameraDenied = feedMode === 'camera' && (camState === 'denied' || camState === 'unavailable')

  // Camera badge text
  const camBadgeText = camState === 'active' ? 'LIVE' : camState === 'requesting' ? 'CONNECTING' : 'CAMERA'
  const camBadgeDot = camState === 'active' ? 'live' : camState === 'requesting' ? 'connecting' : 'idle'

  const replayBadgeDot = status === 'running' ? status : status === 'paused' ? 'paused' : (hasVideo === false ? 'canvas' : 'idle')

  return (
    <section className="feed">
      {/* ── mode toggle ── */}
      {/* Disabled mid-run: switching feeds while the procedure is live would
          mean two independent event sources (the scripted clock and a real
          pinch) could both drive the engine at once. Reset first. */}
      <div className="feed-modes" role="group" aria-label="Feed mode">
        <button
          className={`feed-mode-btn ${feedMode === 'replay' ? 'feed-mode-btn--active' : ''}`}
          onClick={() => onFeedModeChange('replay')}
          aria-pressed={feedMode === 'replay'}
          disabled={status !== 'idle'}
          title={status !== 'idle' ? 'Reset the experiment to switch feeds' : undefined}
        >
          Demo Replay
        </button>
        <button
          className={`feed-mode-btn ${feedMode === 'camera' ? 'feed-mode-btn--active' : ''}`}
          onClick={() => onFeedModeChange('camera')}
          aria-pressed={feedMode === 'camera'}
          disabled={status !== 'idle'}
          title={status !== 'idle' ? 'Reset the experiment to switch feeds' : undefined}
        >
          Live Hand
        </button>
      </div>

      {/* ── frame ── */}
      <div className="feed-frame">

        {/* Replay: real video */}
        <video
          ref={videoRef}
          className="feed-video"
          src="/media/experiment.mp4"
          playsInline
          muted
          preload="auto"
          onError={() => setHasVideo(false)}
          onLoadedData={() => setHasVideo(true)}
          style={{
            display: feedMode === 'replay' && showReplayVideo ? 'block' : 'none',
            visibility: showReplayVideo ? 'visible' : 'hidden',
          }}
        />

        {/* Replay: canvas fallback when no MP4 */}
        {feedMode === 'replay' && (
          <AnimatePresence>
            {(hasVideo === false || hasVideo === null) && (
              <motion.canvas
                ref={canvasRef}
                className="feed-canvas"
                initial={{ opacity: hasVideo === null ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              />
            )}
          </AnimatePresence>
        )}
        {/* Driven by lastTRef — the exact clock reported to the backend, so
            the animation and the scenario player can never drift, and Reset
            rewinds both at once. */}
        {feedMode === 'replay' && <DemoCanvas clockRef={lastTRef} canvasRef={canvasRef} />}

        {/* Camera: live video element */}
        <video
          ref={camVideoRef}
          className="feed-video feed-video--camera"
          autoPlay
          playsInline
          muted
          style={{ display: feedMode === 'camera' && showCameraFeed ? 'block' : 'none' }}
        />

        {/* Camera: hand tracking + virtual scene overlay */}
        <HandStage
          videoRef={camVideoRef}
          active={showCameraFeed}
          emitEnabled={status === 'running'}
          onAction={onHandAction}
        />

        {/* Camera: connecting state */}
        <AnimatePresence>
          {showCameraConnecting && (
            <motion.div
              className="feed-camera-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="feed-camera-spinner" />
              <span className="eyebrow">Connecting camera…</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera: needs permission */}
        <AnimatePresence>
          {showCameraRequest && (
            <motion.div
              className="feed-camera-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="eyebrow">Live Hand</span>
              <p className="feed-camera-msg">
                Reach toward the virtual boxes with your own hand — a pretrained hand-tracking
                model turns a pinch-and-drag into a real action event.
              </p>
              <button className="btn btn--primary feed-camera-cta" onClick={startCamera}>
                Start Camera
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera: denied or unavailable */}
        <AnimatePresence>
          {showCameraDenied && (
            <motion.div
              className="feed-camera-state feed-camera-state--error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="eyebrow feed-camera-error-label">
                {camState === 'denied' ? 'Camera access denied' : 'Camera unavailable'}
              </span>
              <p className="feed-camera-msg">
                {camState === 'denied'
                  ? 'Permission was not granted. Allow camera access in your browser settings, then try again.'
                  : 'Your browser does not support camera access on this device.'}
              </p>
              <button className="btn feed-camera-cta" onClick={() => onFeedModeChange('replay')}>
                Switch to Demo Replay
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paused overlay */}
        <AnimatePresence>
          {status === 'paused' && (
            <motion.div
              className="feed-paused"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="eyebrow">Paused</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Badge — bottom left */}
        <div className="feed-badge">
          {feedMode === 'replay' ? (
            <>
              <span className="feed-dot" data-status={replayBadgeDot} />
              <span className="code">
                {hasVideo === false ? 'CAM-01 · CANVAS REPLAY' : 'CAM-01 · REPLAY'}
              </span>
            </>
          ) : (
            <>
              <span className="feed-dot" data-cam={camBadgeDot} />
              <span className="code">CAM-01 · {camBadgeText}</span>
            </>
          )}
        </div>

        {/* Perception label — top right — visible always, and precise:
            Live Hand's hand tracking is a real pretrained model; the boxes
            it interacts with are still virtual/known, not perceived, and
            the procedure judgement underneath is deterministic, not ML. */}
        <div className="feed-perception-label">
          <span className="code">
            {feedMode === 'camera' ? 'PERCEPTION · HAND TRACKING' : 'PERCEPTION · SIMULATED'}
          </span>
        </div>
      </div>

      {/* ── observed action ── */}
      <div className="observed">
        <span className="eyebrow">Observed action</span>
        {lastEvent ? (
          <motion.div
            key={`${lastEvent.action}-${lastEvent.clock}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="observed-row"
          >
            <span className="observed-action">{lastEvent.action}</span>
            <span className="observed-conf num">
              {lastEvent.confidence.toFixed(2)}
              <em>confidence</em>
            </span>
          </motion.div>
        ) : (
          <div className="observed-row observed-row--empty">
            <span className="observed-action">—</span>
          </div>
        )}
      </div>
    </section>
  )
}
