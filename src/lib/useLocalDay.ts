import { useEffect, useState } from 'react'
import { todayKey } from './dates'

/** Keep a home screen left open overnight current without disturbing an active run. */
export function useLocalDay(): string {
  const [day, setDay] = useState(todayKey)
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setDay(todayKey()) }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return day
}
