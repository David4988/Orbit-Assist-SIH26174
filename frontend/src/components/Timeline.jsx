import { motion } from 'framer-motion'
import './Timeline.css'

const EASE = [0.22, 1, 0.36, 1]

const TONE = {
  done: 'go',
  done_late: 'go',
  skipped: 'hold',
  pending: 'idle',
}

/** Compact progress strip — the whole run legible at a glance. */
export default function Timeline({ steps, currentIndex, status }) {
  const running = status === 'running' || status === 'paused'
  return (
    <div className="timeline">
      {steps.map((step, i) => {
        const current = running && i === currentIndex
        const tone = current ? 'current' : TONE[step.status]
        return (
          <div key={step.id} className={`tl-seg tl-seg--${tone}`}>
            <div className="tl-bar">
              <motion.div
                className="tl-fill"
                initial={false}
                animate={{
                  scaleX: step.status === 'pending' && !current ? 0 : 1,
                }}
                transition={{ duration: 0.32, ease: EASE }}
              />
            </div>
            <span className="tl-label num">{String(i + 1).padStart(2, '0')}</span>
          </div>
        )
      })}
    </div>
  )
}
