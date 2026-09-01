import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import './Summary.css'

const EASE = [0.22, 1, 0.36, 1]

export default function Summary({ steps, events, duration, runId }) {
  const [logText, setLogText] = useState('')
  const [showLog, setShowLog] = useState(false)

  const executed = steps.filter((s) => s.status === 'done' || s.status === 'done_late').length
  const recovered = steps.filter((s) => s.status === 'done_late').length
  const skipped = steps.filter((s) => s.status === 'skipped').length
  const errors = events.filter((e) =>
    ['wrong_object', 'wrong_action', 'unknown'].includes(e.kind)
  ).length

  useEffect(() => {
    fetch('/api/log/text')
      .then((r) => r.json())
      .then((d) => setLogText(d.text || ''))
      .catch(() => {})
  }, [])

  const stats = [
    { label: 'Steps executed', value: `${executed} / ${steps.length}` },
    { label: 'Errors corrected', value: errors },
    { label: 'Steps recovered', value: recovered },
    { label: 'Steps skipped', value: skipped },
    { label: 'Duration', value: `${Math.round(duration)}s` },
  ]

  return (
    <motion.div
      className="summary"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="summary-head">
        <span className="eyebrow">Run · Complete</span>
        <h2>Procedure executed successfully</h2>
      </div>

      <dl className="summary-stats">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="summary-stat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.06 + i * 0.05 }}
          >
            <dt className="eyebrow">{s.label}</dt>
            <dd className="num">{s.value}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="summary-actions">
        <button className="btn btn--ghost" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Hide log' : 'View experiment log'}
        </button>
        <a className="btn btn--ghost" href="/api/log" download>
          Download log
        </a>
        {runId && <span className="code summary-run">runs/{runId}/log.txt</span>}
      </div>

      {showLog && (
        <motion.pre
          className="summary-log"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          {logText}
        </motion.pre>
      )}
    </motion.div>
  )
}
