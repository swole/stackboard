import { useEffect, useState } from 'react'

/**
 * In-button confirm: the first click arms the button ("Open 23?"), a second click within
 * `timeout` goes through, otherwise it quietly disarms. Replaces the browser's confirm().
 */
export function useTwoStep(timeout = 3000) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), timeout)
    return () => clearTimeout(t)
  }, [armed, timeout])

  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false) }
}
