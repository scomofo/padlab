import { useEffect } from 'react'
import { KEY_TO_PAD, padBus } from './inputBus'
import { unlockAudio } from '../audio/audio'

/** Mounts the computer-keyboard pad mapping for pads 1..maxPad. */
export function usePadKeyboard(maxPad: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return
      const target = ev.target as HTMLElement | null
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('[contenteditable="true"]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))) return
      const pad = KEY_TO_PAD[ev.key.toLowerCase()]
      if (!pad || pad > maxPad) return
      ev.preventDefault()
      unlockAudio()
      padBus.emit({ pad, velocity: 100, source: 'keyboard', timeStamp: ev.timeStamp })
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [maxPad, enabled])
}
