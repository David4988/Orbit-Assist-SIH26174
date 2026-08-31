import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import './Feed.css'

const EASE = [0.22, 1, 0.36, 1]

/**
 * The experiment feed.
 *
 * The <video> element is the demo's master clock: its currentTime drives the
 * scenario and therefore the engine, so observed actions always line up with
 * what is on screen, and pausing the video stops the run for free.
 *
 * If no recording is present the component falls back to a wall clock, so the
 * demo still runs end to end before the footage has been shot.
 */
export default function Feed({ status, onClock, videoRef, lastEvent, onVideoMissing }) {
  const localRef = useRef(null)
  const ref = videoRef || localRef
  const [hasVideo, setHasVideo] = useState(true)
  const fallbackStart = useRef(null)

  // Report whether a real recording backs the feed, so App can drive
  // play/pause against the right clock source.
  useEffect(() => { onVideoMissing?.(!hasVideo) }, [hasVideo, onVideoMissing])

  useEffect(() => {
    const v = ref.current
    let raf
    let last = -1

    const loop = () => {
      let t = null

      if (hasVideo && v && !Number.isNaN(v.duration)) {
        t = v.currentTime
      } else if (status === 'running') {
        if (fallbackStart.current == null) fallbackStart.current = performance.now() / 1000 - last
        t = performance.now() / 1000 - fallbackStart.current
      } else if (status === 'idle') {
        fallbackStart.current = null
        last = -1
      }

      if (t != null && Math.abs(t - last) > 0.2) {
        last = t
        onClock(t)
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ref, onClock, hasVideo, status])

  return (
    <section className="feed">
      <div className="feed-frame">
        <video
          ref={ref}
          className="feed-video"
          src="/media/experiment.mp4"
          playsInline
          muted
          preload="auto"
          onError={() => setHasVideo(false)}
          style={{ visibility: hasVideo ? 'visible' : 'hidden' }}
        />

        {!hasVideo && (
          <div className="feed-placeholder">
            <span className="eyebrow">Experiment feed</span>
            <p>
              {status === 'running'
                ? 'Recording not yet loaded — procedure running on internal clock'
                : 'Fixed payload camera — standby'}
            </p>
          </div>
        )}

        {hasVideo && status === 'idle' && (
          <div className="feed-placeholder">
            <span className="eyebrow">Experiment feed</span>
            <p>Fixed payload camera — standby</p>
          </div>
        )}

        {status === 'paused' && (
          <motion.div
            className="feed-paused"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="eyebrow">Paused</span>
          </motion.div>
        )}

        <div className="feed-badge">
          <span className="feed-dot" data-status={status} />
          <span className="code">CAM-01 · FIXED</span>
        </div>
      </div>

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
