import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Voice guidance via the browser's offline speech synthesis.
 *
 * Chrome refuses to speak until the page has received a user gesture, and
 * fails silently when it does — so `prime()` is called from the Start click
 * to unlock the queue with an empty utterance. Without it the first alert
 * of the demo is silently missing.
 *
 * Two bugs addressed here:
 *  1. Simultaneous male+female voices: caused by utterances piling up in the
 *     browser queue (the default system voice fires for already-queued items
 *     while the preferred voice fires for new ones). Fixed by cancelling the
 *     queue before each new utterance.
 *  2. Voice heard after toggling off: queued utterances kept playing because
 *     only the gate was closed, not the queue flushed. Fixed by a useEffect
 *     that calls cancel() the moment enabled flips to false.
 */
export function useSpeech() {
  const [enabled, setEnabled] = useState(true)
  const primed = useRef(false)
  const enabledRef = useRef(true)
  enabledRef.current = enabled

  // Flush the speech queue immediately when the user turns voice off.
  useEffect(() => {
    if (!enabled) {
      window.speechSynthesis?.cancel()
    }
  }, [enabled])

  const prime = useCallback(() => {
    if (primed.current || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
    primed.current = true
  }, [])

  const speak = useCallback((text) => {
    if (!text || !enabledRef.current || !window.speechSynthesis) return

    // Cancel any pending or playing utterances before queuing the new one.
    // This prevents queue accumulation (which causes the two-voice overlap)
    // and ensures guidance stays current rather than playing stale alerts.
    window.speechSynthesis.cancel()

    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    u.pitch = 1.0

    const applyVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find((v) => /Samantha|Daniel|Karen|Serena/.test(v.name))
      if (preferred) u.voice = preferred
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      // Voices already loaded — apply immediately and speak.
      applyVoice()
      window.speechSynthesis.speak(u)
    } else {
      // Voices not yet loaded (common on first call in Chrome). Wait for the
      // event, then speak. Guard with enabledRef in case voice is toggled off
      // in the gap between cancel() and the voices-changed callback.
      const onReady = () => {
        window.speechSynthesis.onvoiceschanged = null
        if (!enabledRef.current) return
        applyVoice()
        window.speechSynthesis.speak(u)
      }
      window.speechSynthesis.onvoiceschanged = onReady
    }
  }, [])

  const cancel = useCallback(() => window.speechSynthesis?.cancel(), [])

  return { speak, prime, cancel, enabled, setEnabled }
}
