import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

import DemoPanel from './components/DemoPanel'
import EventLog from './components/EventLog'
import Feed from './components/Feed'
import OrbitMark from './components/OrbitMark'
import Procedure from './components/Procedure'
import Summary from './components/Summary'
import Timeline from './components/Timeline'
import About from './components/About'
import { useSession } from './hooks/useSession'
import { useSpeech } from './hooks/useSpeech'
import './App.css'

const EASE = [0.22, 1, 0.36, 1]

// Run status in the operator's own vocabulary, not the internal state name.
const RUN_LABEL = { idle: 'STANDBY', running: 'ACTIVE', paused: 'HOLD', complete: 'COMPLETE' }
const RUN_TONE = { idle: 'muted', running: 'active', paused: 'hold', complete: 'go' }
// The headline the operator reads first — one real state, made legible from
// across the room, not a fabricated metric.
const SYSTEM_LABEL = { idle: 'System ready', running: 'System active', paused: 'System hold', complete: 'Run complete' }

export default function App() {
  const { speak, prime, cancel, enabled, setEnabled } = useSpeech()
  const { snapshot, connected, sendClock, post } = useSession(speak)
  const [demoOpen, setDemoOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  // feedMode is owned by App so that play/pause/reset can coordinate correctly.
  // 'replay' = scripted MP4/canvas replay (master clock from video.currentTime)
  // 'camera' = live webcam visual feed (clock from performance.now wall clock)
  const [feedMode, setFeedMode] = useState('replay')

  // Replay video ref — App owns this so it can call play/pause on it.
  const videoRef = useRef(null)

  const state = snapshot?.state
  const status = state?.status ?? 'idle'
  const steps = state?.steps ?? []
  const events = state?.events ?? []

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '`' || e.key === '~') setDemoOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleStart = useCallback(async () => {
    prime() // unlock speech synthesis while we still have the user gesture
    // "scripted" mode lets the clock drive the demo_master scenario;
    // "live" mode disables that entirely so only real pinch-driven events
    // from Live Hand reach the engine — see backend/main.py Session.tick.
    const mode = feedMode === 'camera' ? 'live' : 'scripted'
    await post('start', { scenario: 'demo_master', mode })
    // Only play the replay video if we are in replay mode and have a video element
    if (feedMode === 'replay') {
      const v = videoRef.current
      if (v) {
        v.currentTime = 0
        v.play().catch(() => {})
      }
    }
    // In camera mode, the wall-clock in Feed drives the elapsed display only —
    // hand interaction events drive the procedure, not the clock.
  }, [post, prime, feedMode])

  const handlePause = useCallback(async () => {
    // Pause the replay video if in replay mode
    if (feedMode === 'replay') {
      videoRef.current?.pause()
    }
    await post('pause')
  }, [post, feedMode])

  const handleResume = useCallback(async () => {
    await post('resume')
    // Resume the replay video if in replay mode
    if (feedMode === 'replay') {
      videoRef.current?.play().catch(() => {})
    }
  }, [post, feedMode])

  const handleReset = useCallback(async () => {
    cancel()
    // Reset the replay video position
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
    await post('reset')
  }, [post, cancel])

  const handleFeedModeChange = useCallback((mode) => {
    // When switching to camera from replay while running, pause the video
    if (mode === 'camera' && feedMode === 'replay' && status === 'running') {
      videoRef.current?.pause()
    }
    // When switching back to replay while running, resume the video
    if (mode === 'replay' && feedMode === 'camera' && status === 'running') {
      videoRef.current?.play().catch(() => {})
    }
    setFeedMode(mode)
  }, [feedMode, status])

  const fire = useCallback((action) => post('event', { action }), [post])

  /** A real pinch-and-drag against a virtual object, from Live Hand mode. */
  const handleHandAction = useCallback(
    (action, confidence) => post('event', { action, confidence, source: 'hand' }),
    [post]
  )

  const currentIndex = state?.current_index ?? 0
  const nextStep = steps[currentIndex + 1]
  const elapsed = state?.t ?? 0
  const lastEvent = events[0]

  return (
    <>
      <div className="top-rail" aria-hidden="true" />
      <div className="app">
      <header className="header">
        <div className="brand">
          <OrbitMark active={status === 'running'} />
          <div>
            <h1>Orbit Assist</h1>
            <p>Scientific operations, guided locally.</p>
          </div>
        </div>

        <div className="header-meta">
          <span className="system-status">
            <span className={`status-dot status-dot--${RUN_TONE[status]}`} />
            <span className={`system-status-text system-status-text--${RUN_TONE[status]}`}>
              {SYSTEM_LABEL[status]}
            </span>
          </span>
          <span className="meta-rule meta-rule--tall" />
          <span className="meta">
            <span className="meta-label">Run</span>
            <span className={`meta-value meta-value--${RUN_TONE[status]}`}>{RUN_LABEL[status]}</span>
          </span>
          <span className="meta-rule" />
          <span className="meta">
            <span className="meta-label">Mode</span>
            <span className={`meta-value ${feedMode === 'camera' ? 'meta-value--cyan' : ''}`}>
              {feedMode === 'camera' ? 'Live Hand' : 'Replay'}
            </span>
          </span>
          <span className="meta-rule" />
          <button className="chip" onClick={() => setAboutOpen(true)}>
            <span className={`chip-dot ${feedMode === 'camera' ? 'chip-dot--live' : ''}`} />
            {feedMode === 'camera' ? 'Perception · Hand tracking' : 'Perception · Simulated'}
          </button>
          <span className="meta-rule" />
          <span className="meta">
            <span className="meta-label">Uplink</span>
            {/* The uplink is a live signal, not an "active operation" — cyan,
                not blue, when it's up. */}
            <span className={`meta-value ${connected ? 'meta-value--cyan' : 'meta-value--stop'}`}>
              {connected ? 'OK' : 'Offline'}
            </span>
          </span>
        </div>
      </header>

      <main className="main">
        <section className="col col--feed">
          <Feed
            status={status}
            onClock={sendClock}
            videoRef={videoRef}
            lastEvent={lastEvent}
            feedMode={feedMode}
            onFeedModeChange={handleFeedModeChange}
            onHandAction={handleHandAction}
          />
          <EventLog events={events} />
        </section>

        <section className="col col--procedure">
          <div className="proc-head">
            <div>
              <div className="proc-head-label">
                <span className="eyebrow">Payload procedure</span>
                <span className="meta"><span className="meta-label">Mission</span><span className="meta-value meta-value--navy">BAS-01</span></span>
              </div>
              <h2>{snapshot?.experiment ?? 'BAS Sample Experiment'}</h2>
            </div>
            <div className="proc-clock">
              <span className="eyebrow">T+</span>
              <span className="num proc-time">{formatTime(elapsed)}</span>
            </div>
          </div>

          <Timeline steps={steps} currentIndex={currentIndex} status={status} />

          <AnimatePresence mode="wait">
            {status === 'complete' ? (
              <motion.div key="summary" className="proc-body">
                <Summary
                  steps={steps}
                  events={events}
                  duration={elapsed}
                  runId={snapshot?.run_id}
                />
              </motion.div>
            ) : (
              <motion.div
                key="procedure"
                className="proc-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <Procedure
                  steps={steps}
                  currentIndex={currentIndex}
                  status={status}
                  alert={state?.alert}
                  elapsed={elapsed}
                />
                {status !== 'idle' && nextStep && (
                  <div className="up-next">
                    <span className="eyebrow">Up next</span>
                    <span className="up-next-text">{nextStep.instruction}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="controls">
        <div className="controls-left">
          {status === 'idle' && (
            <button className="btn btn--primary" onClick={handleStart}>
              Start experiment
            </button>
          )}
          {status === 'running' && (
            <button className="btn" onClick={handlePause}>Pause</button>
          )}
          {status === 'paused' && (
            <button className="btn btn--primary" onClick={handleResume}>Resume</button>
          )}
          {status !== 'idle' && (
            <button className="btn btn--ghost" onClick={handleReset}>Reset</button>
          )}
        </div>

        <div className="controls-right">
          <button
            className={`btn btn--ghost ${enabled ? '' : 'btn--muted'}`}
            onClick={() => { setEnabled(!enabled); if (enabled) cancel() }}
          >
            {enabled ? 'Voice on' : 'Voice off'}
          </button>
          <a className="btn btn--ghost" href="/api/log" download>Download log</a>
        </div>
      </footer>

      <DemoPanel open={demoOpen} onClose={() => setDemoOpen(false)} onFire={fire} />
      <About open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </div>
    </>
  )
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
