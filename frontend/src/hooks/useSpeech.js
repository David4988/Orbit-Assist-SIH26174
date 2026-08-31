import { useCallback, useRef, useState } from 'react'

/**
 * Voice guidance via the browser's offline speech synthesis.
 *
 * Chrome refuses to speak until the page has received a user gesture, and
 * fails silently when it does — so `prime()` is called from the Start click
 * to unlock the queue with an empty utterance. Without it the first alert
 * of the demo is silently missing.
 */
export function useSpeech() {
  const [enabled, setEnabled] = useState(true)
  const primed = useRef(false)
  const enabledRef = useRef(true)
  enabledRef.current = enabled

  const prime = useCallback(() => {
    if (primed.current || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
    primed.current = true
  }, [])

  const speak = useCallback((text) => {
    if (!text || !enabledRef.current || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    u.pitch = 1.0
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find((v) => /Samantha|Daniel|Karen|Serena/.test(v.name))
    if (preferred) u.voice = preferred
    window.speechSynthesis.speak(u)
  }, [])

  const cancel = useCallback(() => window.speechSynthesis?.cancel(), [])

  return { speak, prime, cancel, enabled, setEnabled }
}
