import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDeadline } from './exam'

afterEach(() => vi.useRealTimers())

describe('useDeadline', () => {
  it('returns null without an attempt deadline', () => {
    const { result } = renderHook(() => useDeadline(null))
    expect(result.current).toBeNull()
  })

  it('corrects for a skewed device clock using server_time', () => {
    vi.useFakeTimers()
    const deviceNow = new Date('2026-11-25T10:00:00Z')
    vi.setSystemTime(deviceNow)
    // Server is 10 minutes ahead of this device; the student has 60 s left by the server's clock.
    const server = new Date(deviceNow.getTime() + 10 * 60_000)
    const attempt = { server_time: server.toISOString(), deadline: new Date(server.getTime() + 60_000).toISOString() }
    const { result } = renderHook(() => useDeadline(attempt))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeGreaterThan(58_000)
    expect(result.current).toBeLessThanOrEqual(60_000)
    act(() => { vi.advanceTimersByTime(61_000) })
    expect(result.current).toBeLessThanOrEqual(0)
  })
})
