import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ctx, master, nodes, getMaster } = vi.hoisted(() => {
  const nodes: { targets: unknown[]; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }[] = []
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const node = () => {
    const targets: unknown[] = []
    const result = {
      targets,
      connect: vi.fn((target: unknown) => { targets.push(target) }),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      type: 'sine',
      buffer: null,
      loop: false,
    }
    nodes.push(result)
    return result
  }
  const master = { name: 'shared master' }
  return {
    nodes,
    master,
    getMaster: vi.fn(() => master),
    ctx: {
      currentTime: 10,
      sampleRate: 48000,
      createOscillator: node,
      createGain: node,
      createBiquadFilter: node,
      createBufferSource: node,
      createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    },
  }
})

vi.mock('../../src/audio/audio', () => ({ getAudioContext: () => ctx, getMaster }))

import { playClick, playSound } from '../../src/audio/drumSynth'
import { DEFAULT_KIT_16 } from '../../src/engine/kits'

beforeEach(() => {
  vi.clearAllMocks()
  nodes.length = 0
  ctx.currentTime = 10
})

function reaches(node: { targets: unknown[] }, destination: unknown): boolean {
  const target = node.targets[0]
  return target === destination || !!(target && typeof target === 'object' && 'targets' in target
    && reaches(target as { targets: unknown[] }, destination))
}

describe('synth output routing', () => {
  it.each(DEFAULT_KIT_16)('routes every voice layer of %s exclusively through its supplied output', (sound) => {
    const output = { name: 'Jam pad gain' } as unknown as AudioNode
    playSound(sound, 11, 80, output)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((node) => reaches(node, output))).toBe(true)
    expect(nodes.some((node) => reaches(node, master))).toBe(false)
    expect(getMaster).not.toHaveBeenCalled()
    expect(nodes.filter((node) => node.start.mock.calls.length).every(
      (node) => node.start.mock.calls[0][0] >= 11,
    )).toBe(true)
  })

  it('keeps the original shared-master API for live and lesson sounds', () => {
    playSound('kick')
    playClick(11, true)
    expect(nodes.every((node) => reaches(node, master))).toBe(true)
    expect(getMaster).toHaveBeenCalledTimes(2)
    expect(nodes.filter((node) => node.start.mock.calls.length).map((node) => node.start.mock.calls[0][0])).toEqual([10, 10, 11])
  })

  it('does not let interleaved live, loop, and click playback change one another’s destination', () => {
    const loopOutput = { name: 'loop' } as unknown as AudioNode
    const clickOutput = { name: 'click' } as unknown as AudioNode
    playSound('snare', 11, 100, loopOutput)
    const loopNodes = [...nodes]
    nodes.length = 0
    playSound('hatClosed', undefined, 100)
    const liveNodes = [...nodes]
    nodes.length = 0
    playClick(11, false, clickOutput)
    expect(loopNodes.every((node) => reaches(node, loopOutput))).toBe(true)
    expect(liveNodes.every((node) => reaches(node, master))).toBe(true)
    expect(nodes.every((node) => reaches(node, clickOutput))).toBe(true)
    expect(getMaster).toHaveBeenCalledTimes(1)
  })
})
