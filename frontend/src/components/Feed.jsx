import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HandStage from './HandStage'
import { BOX, CHOREO, FALLBACK_BEATS, sceneAt, stage } from './demoScene'
import './Feed.css'

const EASE = [0.22, 1, 0.36, 1]

// Mirrors EventLog's TONE map — the same event, the same color, wherever it
// appears on the page.
const OUTCOME_TONE = {
  correct: 'go',
  skipped: 'hold',
  done_late: 'go',
  wrong_object: 'stop',
  wrong_action: 'stop',
  unknown: 'hold',
}

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

      // ── container / outer box ── a whisper of orbital blue, not plain
      // white/grey — controlled payload hardware, not a generic UI box.
      const containerOpen = scene.open
      ctx.strokeStyle = 'rgba(18,43,71,0.7)'
      ctx.lineWidth = 2
      ctx.fillStyle = containerOpen ? 'rgba(27,86,168,0.05)' : 'rgba(27,86,168,0.09)'
      ctx.beginPath()
      ctx.roundRect(cX - cW / 2, cY, cW, cH, 4)
      ctx.fill(); ctx.stroke()

      // lid
      if (!containerOpen) {
        ctx.fillStyle = '#c3cddb'
        ctx.beginPath()
        ctx.roundRect(cX - cW / 2 - 2, cY - 8, cW + 4, 12, 3)
        ctx.fill(); ctx.stroke()
      } else {
        // open lid leaning back
        ctx.save()
        ctx.translate(cX - cW / 2, cY)
        ctx.rotate(-0.45)
        ctx.fillStyle = '#c3cddb'
        ctx.beginPath()
        ctx.roundRect(0, -12, cW + 4, 12, 3)
        ctx.fill(); ctx.stroke()
        ctx.restore()
      }

      // label on container
      ctx.fillStyle = 'rgba(18,43,71,0.75)'
      ctx.font = `600 ${Math.max(9, W * 0.012)}px "IBM Plex Mono", monospace`
      ctx.textAlign = 'center'
      ctx.fillText('PAYLOAD CONTAINER', cX, bY - 10)

      // ── placement targets ──
      // Centred on the marker itself — a box resting here sits in the
      // middle of the ring, not at its edge.
      const mR = g.markerR
      drawTargetZone(ctx, g.redMarker.x, g.redMarker.y, mR, 'RED', isAtRest(scene.boxes.RED, g.redMarker))
      drawTargetZone(ctx, g.yellowMarker.x, g.yellowMarker.y, mR, 'YELLOW', isAtRest(scene.boxes.YELLOW, g.yellowMarker))

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

/** Has this box actually come to rest at this marker (not mid-flight, not
    carried)? Real scene state, not a guess — used to light the target green. */
function isAtRest(box, marker) {
  return box.visible && !box.lifted && Math.abs(box.x - marker.x) < 1 && Math.abs(box.y - marker.y) < 1
}

/** A placement target: a reference circle with four short reticle ticks and
    a designation underneath — steel while empty, aurora green once a box
    has genuinely come to rest there. The same idiom Live Hand's overlay
    uses, so a target zone reads identically in both feed modes. */
function drawTargetZone(ctx, cx, cy, r, label, occupied) {
  const color = occupied ? 'rgba(20,122,92,0.85)' : 'rgba(92,114,144,0.55)'
  ctx.strokeStyle = color
  ctx.lineWidth = occupied ? 2.25 : 1.75
  ctx.setLineDash(occupied ? [] : [4, 4])
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])

  const tick = 4.5
  const gap = 3
  ctx.lineWidth = 1.5
  ;[[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
    ctx.beginPath()
    ctx.moveTo(cx + dx * (r + gap), cy + dy * (r + gap))
    ctx.lineTo(cx + dx * (r + gap + tick), cy + dy * (r + gap + tick))
    ctx.stroke()
  })

  ctx.fillStyle = 'rgba(92,114,144,0.85)'
  ctx.font = `600 9px "IBM Plex Mono", monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`TARGET · ${label}`, cx, cy + r + 16)
}

/** One coloured box. Carried boxes are raised, shadowed and ringed with a
    cyan tracking indicator; pushed boxes get none of that, so a shove never
    reads as a pick-up. */
function drawBox(ctx, box, fill, edge) {
  if (!box.visible) return
  const s = box.lifted ? BOX * 1.15 : BOX
  if (box.lifted) {
    ctx.strokeStyle = 'rgba(3,125,146,0.7)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.arc(box.x, box.y, s * 0.82, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    ctx.shadowColor = 'rgba(18,43,71,0.4)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 5
  }
  ctx.fillStyle = fill
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.roundRect(box.x - s / 2, box.y - s / 2, s, s, 3)
  ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
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

  // The badge's second line — what the feed is actually doing right now, in
  // the operator's own terms rather than a raw mode name.
  const feedDetail =
    feedMode === 'replay'
      ? hasVideo === false
        ? 'Scenario synchronized'
        : 'Fixed payload view'
      : camState === 'active'
        ? 'Hand tracking active'
        : camState === 'requesting'
          ? 'Acquiring signal'
          : 'Standby'

  return (
    <section className="feed">
      {/* ── mode toggle ── */}
      {/* Disabled mid-run: switching feeds while the procedure is live would
          mean two independent event sources (the scripted clock and a real
          pinch) could both drive the engine at once. Reset first. */}
      <div className="feed-modes" role="group" aria-label="Feed mode">
        <button
          className={`feed-mode-btn feed-mode-btn--blue ${feedMode === 'replay' ? 'feed-mode-btn--active' : ''}`}
          onClick={() => onFeedModeChange('replay')}
          aria-pressed={feedMode === 'replay'}
          disabled={status !== 'idle'}
          title={status !== 'idle' ? 'Reset the experiment to switch feeds' : undefined}
        >
          Demo Replay
        </button>
        <button
          className={`feed-mode-btn feed-mode-btn--cyan ${feedMode === 'camera' ? 'feed-mode-btn--active' : ''}`}
          onClick={() => onFeedModeChange('camera')}
          aria-pressed={feedMode === 'camera'}
          disabled={status !== 'idle'}
          title={status !== 'idle' ? 'Reset the experiment to switch feeds' : undefined}
        >
          Live Hand
        </button>
      </div>

      {/* ── frame ── */}
      <div className="feed-frame-shell">
      <span className="feed-corner feed-corner--tl" aria-hidden="true" />
      <span className="feed-corner feed-corner--tr" aria-hidden="true" />
      <span className="feed-corner feed-corner--bl" aria-hidden="true" />
      <span className="feed-corner feed-corner--br" aria-hidden="true" />
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

        {/* Badge — bottom left. Two tiers: the fixed device ID (what it is)
            and what it is presently doing (why the picture looks the way
            it does) — the same distinction a payload console would make. */}
        <div className="feed-badge">
          {feedMode === 'replay' ? (
            <span className="feed-dot" data-status={replayBadgeDot} />
          ) : (
            <span className="feed-dot" data-cam={camBadgeDot} />
          )}
          <span className="feed-badge-text">
            <span className="code feed-badge-id">
              CAM-01 ·{' '}
              <span className={showCameraFeed ? 'feed-badge-live' : ''}>
                {feedMode === 'replay' ? 'REPLAY' : camBadgeText}
              </span>
            </span>
            <span className="feed-badge-detail">{feedDetail}</span>
          </span>
        </div>

        {/* Perception label — top right — visible always, and precise:
            Live Hand's hand tracking is a real pretrained model; the boxes
            it interacts with are still virtual/known, not perceived, and
            the procedure judgement underneath is deterministic, not ML.
            The cyan wash appears only once the signal is genuinely live. */}
        <div className={`feed-perception-label ${showCameraFeed ? 'feed-perception-label--live' : ''}`}>
          <span className="code">
            {feedMode === 'camera' ? 'PERCEPTION · HAND TRACKING' : 'PERCEPTION · SIMULATED'}
          </span>
        </div>
      </div>
      </div>

      {/* ── observed action ── */}
      <div className="observed panel">
        <span className="eyebrow">Observed action</span>
        {lastEvent ? (
          <motion.div
            key={`${lastEvent.action}-${lastEvent.clock}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="observed-row"
          >
            <span className="observed-action">
              <motion.span
                className={`observed-outcome-dot observed-outcome-dot--${OUTCOME_TONE[lastEvent.kind] || 'ink'}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.24, ease: EASE }}
              />
              {lastEvent.action}
            </span>
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
