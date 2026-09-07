import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { isBundled, BUNDLE_MARKER } = require('../../electron/runtime-mode.cjs')

describe('desktop release policy', () => {
  it('recognizes a normally packaged Electron app', () => {
    const exists = vi.fn(() => false)
    expect(isBundled(true, '/app', exists)).toBe(true)
    expect(exists).not.toHaveBeenCalled()
  })
  it('recognizes the signed marker when the executable retains the Electron name', () => {
    const exists = vi.fn((path) => path.endsWith(`/${BUNDLE_MARKER}`))
    expect(isBundled(false, '/PadLab.app/Contents/Resources/app', exists)).toBe(true)
    expect(exists).toHaveBeenCalledWith(`/PadLab.app/Contents/Resources/app/${BUNDLE_MARKER}`)
  })
  it('keeps an unmarked development shell in development mode', () => {
    expect(isBundled(false, '/source/electron', () => false)).toBe(false)
  })
})
