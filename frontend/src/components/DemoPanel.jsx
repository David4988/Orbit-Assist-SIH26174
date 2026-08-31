import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import './DemoPanel.css'

const EASE = [0.22, 1, 0.36, 1]

const ACTIONS = [
  ['1', 'OPEN_CONTAINER', 'Open container'],
  ['2', 'PICK_RED_BOX', 'Pick red'],
  ['3', 'PLACE_RED_BOX', 'Place red'],
  ['4', 'PICK_YELLOW_BOX', 'Pick yellow'],
  ['5', 'PLACE_YELLOW_BOX', 'Place yellow'],
  ['6', 'CLOSE_CONTAINER', 'Close container'],
  ['b', 'PICK_BLUE_BOX', 'Pick blue (wrong object)'],
]

/**
 * Discreet operator panel, opened with `~`.
 *
 * Not part of the product — it exists so any event can be triggered live if
 * a judge asks "what happens if...". Deliberately hidden by default.
 */
export default function DemoPanel({ open, onClose, onFire }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose()
      const hit = ACTIONS.find(([key]) => key === e.key.toLowerCase())
      if (hit) onFire(hit[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onFire])

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="demo-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <div className="demo-panel-head">
            <span className="eyebrow">Operator console</span>
            <button className="demo-close" onClick={onClose} aria-label="Close">esc</button>
          </div>
          <div className="demo-grid">
            {ACTIONS.map(([key, action, label]) => (
              <button key={action} className="demo-btn" onClick={() => onFire(action)}>
                <kbd>{key}</kbd>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="demo-note">
            Injects an action event directly into the procedure engine.
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
