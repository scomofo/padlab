/**
 * MIDI device memory — remember the last-played controller by name and
 * manufacturer so the "primary device" survives the browser's opaque device
 * ids changing underneath it (OS MIDI backend restarts, unplug/replug on a
 * different port, the Windows MIDI Services rollout).
 *
 * Approach ported from midi-stage2 (`remapMidiRouteInputIds`): a stored id
 * that is still live wins; when it is gone, exactly one live input matching
 * the remembered name+manufacturer re-links the assignment. Zero or several
 * matches leave the assignment on the first live input and the UI says the
 * remembered controller wasn't found — never silently bind the wrong device.
 */

export interface LiveInput {
  id: string
  name: string
  manufacturer: string
}

export interface DeviceIdentity {
  /** The browser's opaque input id. Preserved exactly; only used for direct hits. */
  id: string
  name: string
  manufacturer: string
}

export type PrimaryStatus =
  | 'direct'       // remembered id is still live
  | 'relinked'     // id changed; exactly one live input matches name+manufacturer
  | 'unremembered' // nothing remembered yet; showing the first live input
  | 'fallback'     // remembered device not uniquely found; showing the first live input
  | 'none'         // no live inputs

export interface PrimaryResolution<T extends LiveInput = LiveInput> {
  status: PrimaryStatus
  input: T | null
  /** The remembered identity, for honest "not found" messaging. Null when none. */
  remembered: DeviceIdentity | null
}

const DEVICE_KEY = 'padlab-mididevice-v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function validIdentity(value: unknown): DeviceIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.manufacturer !== 'string') return null
  // The id is opaque — preserve it exactly, including punctuation. The name
  // must be non-blank or there is nothing to match against later.
  if (!v.name.trim()) return null
  return { id: v.id, name: v.name.trim(), manufacturer: v.manufacturer.trim() }
}

/** The last-played controller, or null when nothing valid was stored. */
export function loadRememberedDevice(from?: StorageLike): DeviceIdentity | null {
  const s = storage(from)
  if (!s) return null
  try {
    const raw: unknown = JSON.parse(s.getItem(DEVICE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const data = raw as Record<string, unknown>
    if (data.version !== 1) return null
    return validIdentity(data.device)
  } catch {
    // Private browsing and malformed saves must not prevent playing.
    return null
  }
}

/** Persist the last-played controller. Returns false when storage is unavailable. */
export function rememberDevice(identity: DeviceIdentity, into?: StorageLike): boolean {
  const s = storage(into)
  if (!s) return false
  const valid = validIdentity(identity)
  if (!valid) return false
  try {
    s.setItem(DEVICE_KEY, JSON.stringify({ version: 1, device: valid }))
    return true
  } catch {
    return false
  }
}

export function clearRememberedDevice(from?: StorageLike): void {
  const s = storage(from)
  if (!s) return
  try { s.removeItem(DEVICE_KEY) } catch { /* best effort */ }
}

function identityMatches(remembered: DeviceIdentity, input: LiveInput): boolean {
  return input.name.trim() === remembered.name
    && input.manufacturer.trim() === remembered.manufacturer
}

/**
 * Pick the input to present as the primary device. Pure — callers persist any
 * refreshed identity via `rememberDevice`.
 */
export function resolvePrimaryDevice<T extends LiveInput>(
  remembered: DeviceIdentity | null,
  live: readonly T[],
): PrimaryResolution<T> {
  if (live.length === 0) return { status: 'none', input: null, remembered }
  if (!remembered) return { status: 'unremembered', input: live[0], remembered }
  const direct = live.find((input) => input.id === remembered.id)
  if (direct) return { status: 'direct', input: direct, remembered }
  const candidates = live.filter((input) => identityMatches(remembered, input))
  if (candidates.length === 1) return { status: 'relinked', input: candidates[0], remembered }
  return { status: 'fallback', input: live[0], remembered }
}
