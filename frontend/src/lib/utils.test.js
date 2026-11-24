import { describe, expect, it } from 'vitest'
import { duration, fmtNum, fmtPct, initials, optionLabel } from './utils'

describe('formatters', () => {
  it('formats numbers without trailing zeros', () => {
    expect(fmtNum(12)).toBe('12')
    expect(fmtNum(12.04)).toBe('12')
    expect(fmtNum(12.25, 2)).toBe('12.25')
    expect(fmtNum(null)).toBe('—')
    expect(fmtNum(Number.NaN)).toBe('—')
  })
  it('formats percentages and keeps zero', () => {
    expect(fmtPct(0)).toBe('0%')
    expect(fmtPct(66.666)).toBe('66.7%')
    expect(fmtPct(undefined)).toBe('—')
  })
  it('formats timer durations', () => {
    expect(duration(-5)).toBe('00:00')
    expect(duration(65_000)).toBe('01:05')
    expect(duration(3_725_000)).toBe('1:02:05')
  })
  it('labels options by position and derives initials', () => {
    expect([0, 1, 2, 3].map(optionLabel).join('')).toBe('ABCD')
    expect(initials('test student two')).toBe('TS')
    expect(initials('')).toBe('?')
  })
})
