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

export default function EventLog({ events }) {
  return (
    <div className="log">
      <div className="log-head">
        <span className="eyebrow">Event log</span>
        <span className="eyebrow log-count num">{events.length}</span>
      </div>

      <div className="log-rows">
        <AnimatePresence initial={false}>
          {events.length === 0 && (
            <div className="log-empty">Events appear here as the procedure runs.</div>
          )}
          {events.map((e, i) => (
            <motion.div
              key={`${e.clock}-${e.action}-${i}`}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className={`log-row log-row--${TONE[e.kind] || 'ink'}`}
            >
              <span className="log-time num">{e.clock}</span>
              <span className="log-action">{e.action}</span>
              <span className="log-outcome">{e.outcome}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
