/**
 * Browser-side hand tracking via MediaPipe's pretrained Hand Landmarker.
 *
 * No model is trained here — this loads a public, pretrained bundle
 * (vendored locally by tools/vendor_mediapipe.sh so the demo stays
 * offline) and runs it against the live camera feed. It returns 21 hand
 * landmarks per frame; everything above that (pinch, hit-testing, the
 * interaction FSM) is geometry, not learning.
 *
 * Runs on CPU by design (no GPU dependency, per the project's own
 * "smallest reliable perception" rule) — Google's benchmark puts this
 * model at ~17ms/frame on CPU on a 2021 mid-range phone, which is
 * comfortably real-time on a laptop.
 *
 * Deliberately state-light: `hand` is exposed through a ref, not React
 * state, so ~30 detections/sec don't force React re-renders. Callers that
 * need to *draw* the hand should run their own rAF loop and read the ref
 * each frame, the same pattern the existing DemoCanvas replay uses.
 */
import { useEffect, useRef, useState } from 'react'

const WASM_BASE = '/mediapipe/wasm'
const MODEL_PATH = '/models/hand_landmarker.task'

let landmarkerPromise = null

async function loadLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  })
}

function getLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = loadLandmarker()
  return landmarkerPromise
}

/**
 * @param {React.RefObject<HTMLVideoElement>} videoRef - a currently-playing
 *   video element (the live camera feed).
 * @param {boolean} active - whether tracking should run at all.
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', error: string|null,
 *   handRef: React.RefObject }} handRef.current is `{ landmarks, score } | null`,
 *   updated every frame the camera delivers a new one.
 */
export function useHandTracker(videoRef, active) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const handRef = useRef(null)
  const rafRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      handRef.current = null
      return
    }

    let cancelled = false
    setStatus('loading')

    getLandmarker()
      .then((landmarker) => {
        if (cancelled) return
        setStatus('ready')

        const loop = () => {
          const video = videoRef.current
          if (video && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime
            const result = landmarker.detectForVideo(video, performance.now())
            if (result.landmarks.length > 0) {
              handRef.current = {
                landmarks: result.landmarks[0],
                score: result.handedness[0]?.[0]?.score ?? 0.5,
              }
            } else {
              handRef.current = null
            }
          }
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      })
      .catch((err) => {
        if (cancelled) return
        setStatus('error')
        setError(err?.message || 'Hand tracking model failed to load')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      handRef.current = null
    }
  }, [active, videoRef])

  return { status, error, handRef }
}
