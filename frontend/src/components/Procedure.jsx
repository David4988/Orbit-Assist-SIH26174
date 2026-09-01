import { AnimatePresence, motion } from 'framer-motion'
import './Procedure.css'

const EASE = [0.22, 1, 0.36, 1]

function Mark({ status }) {
  if (status === 'done' || status === 'done_late') {
    return (
      <svg viewBox="0 0 16 16" className="mark-icon" aria-hidden="true">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'skipped') {
    return (
      <svg viewBox="0 0 16 16" className="mark-icon" aria-hidden="true">
        <path d="M8 4v5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
      </svg>
    )
  }
  return null
}

/**
 * The procedure document — the backbone of the interface.
 *
 * Every step stays visible. The active one expands and is the only element
 * on the page carrying elevation; completed steps collapse to a single line
 * with their timestamp stamped into the left margin; skipped steps stay
 * open in amber until they're repaired. That single object covers current
 * step, next step, timeline and per-step status at once.
 */
export default function Procedure({ steps, currentIndex, status, alert, elapsed = 0 }) {
  const running = status === 'running' || status === 'paused'

  return (
    <ol className="procedure">
      {steps.map((step, i) => {
        const isCurrent = running && i === currentIndex
        const state = isCurrent ? 'current' : step.status
        const showAlert = isCurrent && alert

        return (
          <motion.li
            key={step.id}
            layout
            transition={{ duration: 0.28, ease: EASE }}
            className={`step step--${state} ${showAlert ? `step--alert-${alert.kind}` : ''}`}
          >
            <div className="step-gutter">
              <span className="step-stamp num">
                {step.completed_at != null ? formatClock(step.completed_at) : ''}
              </span>
            </div>

            <div className="step-index">
              <span className="step-number num">{String(i + 1).padStart(2, '0')}</span>
              <span className="step-mark"><Mark status={step.status} /></span>
            </div>

            <div className="step-body">
              <div className="step-instruction">{step.instruction}</div>

              <AnimatePresence initial={false}>
                {isCurrent && (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.24, ease: EASE }}
                    className="step-detail"
                  >
                    <span className="code">{step.verb}_{step.object}</span>
                    <span className="meta-rule" />
                    <span className="meta">
                      <span className="meta-label">T+</span>
                      <span className="meta-value">{formatClock(elapsed)}</span>
                    </span>
                    <span className="meta-rule" />
                    <span className="meta"><span className="meta-value meta-value--active">Active</span></span>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showAlert && (
                  <motion.div
                    key="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.24, ease: EASE }}
                    className="step-correction"
                  >
                    <span className="step-correction-head">{alert.headline}</span>
                    <span className="step-correction-detail">{alert.detail}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {step.status === 'skipped' && (
                <div className="step-correction step-correction--skipped">
                  <span className="step-correction-head">Skipped</span>
                  <span className="step-correction-detail">
                    Return to this step to complete the procedure.
                  </span>
                </div>
              )}

              {step.status === 'done_late' && (
                <div className="step-note">Completed out of order — recovered</div>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
