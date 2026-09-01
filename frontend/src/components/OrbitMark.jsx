import { motion, useReducedMotion } from 'framer-motion'

/**
 * The wordmark's orbit — a ring with a single satellite point, not a static
 * logo bullet. It only travels while a run is active: idle work leaves it
 * parked at apogee, so the motion itself reports "something is executing"
 * rather than decorating the header for its own sake.
 */
export default function OrbitMark({ active }) {
  const reduce = useReducedMotion()
  const spin = active && !reduce

  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-mark-core" />
      <motion.span
        className="brand-mark-orbit"
        animate={{ rotate: spin ? 360 : 0 }}
        transition={
          spin
            ? { duration: 7, ease: 'linear', repeat: Infinity }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <span className="brand-mark-sat" />
      </motion.span>
    </span>
  )
}
