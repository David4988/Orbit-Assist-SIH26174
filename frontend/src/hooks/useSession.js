import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

/**
 * Owns the connection to the backend.
 *
 * The backend holds all run state; this hook simply mirrors the latest
 * snapshot and forwards the demo video's clock. Because snapshots are
 * complete (never deltas), a dropped connection costs nothing — the next
 * message re-renders everything.
 */
export function useSession(onSpeak) {
  const [snapshot, setSnapshot] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const speakRef = useRef(onSpeak)
  speakRef.current = onSpeak

  useEffect(() => {
    let closed = false
    let retry

    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        setSnapshot(data)
        if (data.speak?.length) data.speak.forEach((t) => speakRef.current?.(t))
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 1000)
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [])

  /** Report the video's playback position — this is the demo's master clock. */
  const sendClock = useCallback((t) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'clock', t }))
    }
  }, [])

  const post = useCallback(async (path, body) => {
    await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  }, [])

  return { snapshot, connected, sendClock, post }
}
