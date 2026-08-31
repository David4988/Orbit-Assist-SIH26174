import { AnimatePresence, motion } from 'framer-motion'
import './About.css'

const EASE = [0.22, 1, 0.36, 1]

/**
 * Honesty panel. States plainly what is real and what is simulated, so the
 * distinction is visible in the product itself rather than only in the
 * spoken pitch.
 */
export default function About({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="about-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="about"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="eyebrow">About this prototype</span>
            <h2>What is real, and what is simulated</h2>

            <div className="about-grid">
              <div>
                <span className="eyebrow about-tag about-tag--real">Genuinely implemented</span>
                <ul>
                  <li>Procedure engine — deterministic sequence validation</li>
                  <li>Skipped-step, wrong-object and wrong-action detection</li>
                  <li>Recovery tracking, including steps completed out of order</li>
                  <li>Next-step guidance and voice announcements</li>
                  <li>Timestamped experiment log (text and JSON)</li>
                </ul>
              </div>
              <div>
                <span className="eyebrow about-tag about-tag--sim">Simulated for this PoC</span>
                <ul>
                  <li>Perception — actions come from a scripted scenario</li>
                  <li>The feed is a recorded video, not an interpreted one</li>
                  <li>Confidence values are authored, not measured</li>
                  <li>No trained model, no accuracy has been measured</li>
                </ul>
              </div>
            </div>

            <p className="about-note">
              Perception emits the same structured action events that a real pipeline
              would produce, so object detection, hand-object interaction and temporal
              activity recognition can replace that layer without changing the
              procedural validation, guidance or logging that this demo shows.
            </p>

            <p className="about-note about-note--muted">
              The six-step sequence is a PoC representation. ISRO&rsquo;s published sample
              experiment is truncated on the public portal after &ldquo;two smaller boxes of
              color red and yello&rdquo;, so the exact official sequence is not available.
            </p>

            <button className="btn btn--ghost" onClick={onClose}>Close</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
