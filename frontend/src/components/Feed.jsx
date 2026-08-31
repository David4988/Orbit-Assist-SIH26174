import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HandStage from './HandStage'
import './Feed.css'

const EASE = [0.22, 1, 0.36, 1]

/* ─────────────────────────────────────────────────────────────────────────────
   Canvas Demo Replay Fallback
   A deterministic lab-bench animation used when no experiment.mp4 is present.
   It provides a genuine "something is being monitored" visual so Demo Replay
   mode is never just an empty standby placeholder.
   The animation is driven by the same wall clock that the scenario player
   uses when there is no video, so the two stay loosely in sync.
───────────────────────────────────────────────────────────────────────────── */
function DemoCanvas({ status, canvasRef }) {
  const animRef = useRef(null)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // Resize to container
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    let last = performance.now()
    const PERIOD = 80 // scene loops every 80 s (matches demo duration)

    const draw = (now) => {
      const dt = (now - last) / 1000
      last = now
      if (status === 'running') tRef.current += dt
      const t = tRef.current % PERIOD

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

      // ── lab bench ──
      const bY = H * 0.65
      ctx.fillStyle = '#d4d8cf'
      ctx.fillRect(0, bY, W, H - bY)
      ctx.strokeStyle = '#b8bdb2'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, bY); ctx.lineTo(W, bY); ctx.stroke()

      // ── container / outer box ──
      const cX = W * 0.5
      const cW = W * 0.28
      const cH = H * 0.22
      const cY = bY - cH

      // container open/closed based on step 1 (t >= 4) and step 6 (t >= 72)
      const containerOpen = t >= 4.0 && t < 72.0
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
      const mRX = W * 0.72
      const mYX = W * 0.26
      const mY = bY + 14
      const mR = 18

      // Red marker
      ctx.strokeStyle = 'rgba(166,43,31,0.35)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(mRX, mY + mR, mR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // Yellow marker
      ctx.strokeStyle = 'rgba(178,106,0,0.35)'
      ctx.beginPath(); ctx.arc(mYX, mY + mR, mR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // ── hand cursor — eased position ──
      // Waypoints keyed to scenario events
      const waypoints = [
        { t: 0,    x: W * 0.5,  y: H * 0.4 },  // idle
        { t: 3.5,  x: W * 0.5,  y: cY + cH * 0.5 }, // reaching for container
        { t: 5.5,  x: W * 0.5,  y: cY - 20 },        // lifting lid
        { t: 9,    x: W * 0.5,  y: H * 0.4 },        // back
        { t: 13.5, x: W * 0.5,  y: cY + cH * 0.5 }, // reach into container
        { t: 23.5, x: W * 0.5,  y: cY + cH * 0.3 }, // still reaching (wrong obj)
        { t: 24.5, x: mRX,      y: mY - 10 },        // move red box
        { t: 33.5, x: mRX,      y: mY + mR },        // placing red
        { t: 36,   x: W * 0.5,  y: H * 0.4 },        // back
        { t: 45.5, x: W * 0.5,  y: cY + cH * 0.5 }, // reach for yellow
        { t: 57.5, x: mYX,      y: mY - 10 },        // move yellow
        { t: 67,   x: mYX,      y: mY + mR },        // placing yellow
        { t: 70,   x: W * 0.5,  y: H * 0.4 },        // back
        { t: 72,   x: W * 0.5,  y: cY - 10 },        // close container
        { t: 75,   x: W * 0.5,  y: H * 0.4 },        // done
      ]

      let hx = W * 0.5, hy = H * 0.4
      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i], b = waypoints[i + 1]
        if (t >= a.t && t < b.t) {
          const p = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
          const ep = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
          hx = a.x + (b.x - a.x) * ep
          hy = a.y + (b.y - a.y) * ep
          break
        }
      }

      if (status === 'running') {
        // hand circle
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
      // Red box: inside container until step 2 (t>=24), at marker after step 3 (t>=34)
      const redAtMarker = t >= 34.0
      const redInHand = t >= 23.5 && t < 34.0
      const bSize = 18
      let rX, rY
      if (redAtMarker) { rX = mRX; rY = mY }
      else if (redInHand) { rX = hx - bSize / 2; rY = hy - bSize / 2 }
      else { rX = cX + 6; rY = cY + cH * 0.4 }
      if (t >= 4.0) { // visible after container opens
        ctx.fillStyle = '#c0392b'
        ctx.strokeStyle = '#922b21'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(rX - bSize / 2, rY - bSize / 2, bSize, bSize, 3)
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.roundRect(rX - bSize / 2 + 2, rY - bSize / 2 + 2, bSize * 0.45, bSize * 0.3, 2)
        ctx.fill()
      }

      // Yellow box: inside container until step 4 (t>=45), marker after step 5 (t>=57 skip)
      const yellowAtMarker = t >= 57.0
      const yellowInHand = t >= 45.5 && t < 57.0
      let yX, yY
      if (yellowAtMarker) { yX = mYX; yY = mY }
      else if (yellowInHand) { yX = hx - bSize / 2; yY = hy - bSize / 2 }
      else { yX = cX - 8; yY = cY + cH * 0.55 }
      if (t >= 4.0) {
        ctx.fillStyle = '#d4ac0d'
        ctx.strokeStyle = '#9a7d0a'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(yX - bSize / 2, yY - bSize / 2, bSize, bSize, 3)
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.roundRect(yX - bSize / 2 + 2, yY - bSize / 2 + 2, bSize * 0.45, bSize * 0.3, 2)
        ctx.fill()
      }

      // Blue box (distractor — always on bench)
      ctx.fillStyle = '#2471a3'
      ctx.strokeStyle = '#1a5276'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(W * 0.15 - bSize / 2, bY - bSize * 1.5, bSize, bSize, 3)
      ctx.fill(); ctx.stroke()

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
      const br = 16, bl = 18
      ctx.strokeStyle = 'rgba(22,50,79,0.4)'
      ctx.lineWidth = 1.5
      const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]
      corners.forEach(([cx, cy, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(cx + sx * br, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * br); ctx.stroke()
      })

      // ── timestamp ──
      const elapsed = tRef.current
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
      const ss = String(Math.floor(elapsed % 60)).padStart(2, '0')
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
  }, [status, canvasRef])

  return null
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
        {feedMode === 'replay' && <DemoCanvas status={status} canvasRef={canvasRef} />}

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
