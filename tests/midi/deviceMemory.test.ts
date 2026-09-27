import { describe, expect, it } from 'vitest'
import {
  clearRememberedDevice,
  loadRememberedDevice,
  rememberDevice,
  resolvePrimaryDevice,
  type DeviceIdentity,
  type LiveInput,
} from '../../src/midi/deviceMemory'

function input(id: string, name: string, manufacturer = ''): LiveInput {
  return { id, name, manufacturer }
}

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v },
    removeItem: (k: string) => { delete data[k] },
    _data: data,
  }
}

const MPK: DeviceIdentity = { id: 'old-id-1', name: 'MPK mini 3', manufacturer: 'AKAI' }

describe('resolvePrimaryDevice', () => {
  it('reports none when no inputs are live', () => {
    const r = resolvePrimaryDevice(MPK, [])
    expect(r.status).toBe('none')
    expect(r.input).toBeNull()
  })

  it('shows the first input when nothing is remembered yet', () => {
    const live = [input('a', 'MPK mini 3', 'AKAI'), input('b', 'SP-404MKII', 'Roland')]
    const r = resolvePrimaryDevice(null, live)
    expect(r.status).toBe('unremembered')
    expect(r.input?.id).toBe('a')
  })

  it('keeps the remembered id when it is still live, even when not first', () => {
    const live = [input('x', 'SP-404MKII', 'Roland'), input('old-id-1', 'MPK mini 3', 'AKAI')]
    const r = resolvePrimaryDevice(MPK, live)
    expect(r.status).toBe('direct')
    expect(r.input?.id).toBe('old-id-1')
  })

  it('re-links to a new id when exactly one live input matches name+manufacturer', () => {
    const live = [input('new-id-9', 'MPK mini 3', 'AKAI'), input('x', 'SP-404MKII', 'Roland')]
    const r = resolvePrimaryDevice(MPK, live)
    expect(r.status).toBe('relinked')
    expect(r.input?.id).toBe('new-id-9')
  })

  it('does not re-link when two live inputs share the remembered identity', () => {
    const live = [
      input('id-1', 'MPK mini 3', 'AKAI'),
      input('id-2', 'MPK mini 3', 'AKAI'),
    ]
    const r = resolvePrimaryDevice(MPK, live)
    expect(r.status).toBe('fallback')
    expect(r.input?.id).toBe('id-1')
    expect(r.remembered).toEqual({ ...MPK })
  })

  it('does not re-link when the name matches but the manufacturer differs', () => {
    const live = [input('id-1', 'MPK mini 3', 'Some Clone Co')]
    const r = resolvePrimaryDevice(MPK, live)
    expect(r.status).toBe('fallback')
    expect(r.input?.id).toBe('id-1')
  })

  it('falls back to the first input when the remembered device is absent', () => {
    const live = [input('x', 'SP-404MKII', 'Roland')]
    const r = resolvePrimaryDevice(MPK, live)
    expect(r.status).toBe('fallback')
    expect(r.input?.id).toBe('x')
  })

  it('matches on trimmed names', () => {
    const remembered: DeviceIdentity = { id: 'gone', name: 'MPK mini 3', manufacturer: 'AKAI' }
    const live = [input('n', '  MPK mini 3  ', 'AKAI')]
    const r = resolvePrimaryDevice(remembered, live)
    expect(r.status).toBe('relinked')
  })

  it('matches by name when both manufacturers are blank', () => {
    const remembered: DeviceIdentity = { id: 'gone', name: 'Generic Keyboard', manufacturer: '' }
    const live = [input('n', 'Generic Keyboard', '')]
    const r = resolvePrimaryDevice(remembered, live)
    expect(r.status).toBe('relinked')
  })
})

describe('device identity persistence', () => {
  it('round-trips a remembered device', () => {
    const s = memoryStore()
    expect(rememberDevice(MPK, s)).toBe(true)
    expect(loadRememberedDevice(s)).toEqual(MPK)
  })

  it('trims on the way in', () => {
    const s = memoryStore()
    rememberDevice({ id: 'i', name: '  MPK mini 3 ', manufacturer: ' AKAI ' }, s)
    expect(loadRememberedDevice(s)).toEqual({ id: 'i', name: 'MPK mini 3', manufacturer: 'AKAI' })
  })

  it('returns null for malformed saves', () => {
    expect(loadRememberedDevice(memoryStore({ 'padlab-mididevice-v1': 'not json' }))).toBeNull()
    expect(loadRememberedDevice(memoryStore({ 'padlab-mididevice-v1': '{"version":2}' }))).toBeNull()
    expect(loadRememberedDevice(memoryStore({ 'padlab-mididevice-v1': '{"version":1}' }))).toBeNull()
  })

  it('rejects identities with blank names or wrong types', () => {
    const s = memoryStore()
    expect(rememberDevice({ id: 'i', name: '   ', manufacturer: '' }, s)).toBe(false)
    expect(loadRememberedDevice(s)).toBeNull()
    const bad = memoryStore({ 'padlab-mididevice-v1': '{"version":1,"device":{"id":5,"name":"x","manufacturer":""}}' })
    expect(loadRememberedDevice(bad)).toBeNull()
  })

  it('survives storage failures without throwing', () => {
    const failing = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(loadRememberedDevice(failing)).toBeNull()
    expect(rememberDevice(MPK, failing)).toBe(false)
    expect(() => clearRememberedDevice(failing)).not.toThrow()
  })

  it('clears the remembered device', () => {
    const s = memoryStore()
    rememberDevice(MPK, s)
    clearRememberedDevice(s)
    expect(loadRememberedDevice(s)).toBeNull()
  })
})
