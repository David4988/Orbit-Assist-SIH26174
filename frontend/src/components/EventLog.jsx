import { AnimatePresence, motion } from 'framer-motion'
import './EventLog.css'

const EASE = [0.22, 1, 0.36, 1]

const TONE = {
  correct: 'go',
  skipped: 'hold',
  done_late: 'go',
  wrong_object: 'stop',
  wrong_action: 'stop',
  unknown: 'hold',
}

// The flash a row lands with — a brief pulse of its own outcome colour that
// fades to nothing, so a new row announces itself once, then quiets down.
const FLASH = {
  go: 'rgba(20,122,92,0.16)',
  hold: 'rgba(178,106,0,0.16)',
  stop: 'rgba(166,43,31,0.14)',
  ink: 'rgba(92,114,144,0.12)',
}

export default function EventLog({ events }) {
  return (
    <div className="log panel">
      <div className="log-head">
        <div>
          <span className="eyebrow">Telemetry log</span>
          <span className="log-pipeline">Observe → Validate → Act</span>
        </div>
        <span className="eyebrow log-count num">{events.length}</span>
      </div>

      {events.length > 0 && (
        <div className="log-columns">
          <span>Observed</span><span>Action</span><span>Outcome</span>
        </div>
      )}

      <div className="log-rows">
        <AnimatePresence initial={false}>
          {events.length === 0 && (
            <div className="log-empty">Events appear here as the procedure runs.</div>
          )}
          {events.map((e, i) => {
            const tone = TONE[e.kind] || 'ink'
            return (
              <motion.div
                key={`${e.clock}-${e.action}-${i}`}
                layout
                initial={{ opacity: 0, y: -8, backgroundColor: FLASH[tone] }}
                animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0,0,0,0)' }}
                transition={{ duration: 0.18, ease: EASE, backgroundColor: { duration: 1.3, ease: 'easeOut' } }}
                className={`log-row log-row--${tone}`}
              >
                <span className="log-time num">{e.clock}</span>
                <span className="log-action">{e.action}</span>
                <span className="log-outcome">{e.outcome}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
