import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ColumnChart, LineChart } from './charts'

// jsdom has no layout; give containers a width so the SVG renders.
let restore
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
  // Deleting the own property falls back to the inherited Element.prototype getter.
  restore = () => delete HTMLElement.prototype.clientWidth
})
afterAll(() => restore())

const tickLabels = (container) => [...container.querySelectorAll('text[text-anchor="end"]')].map((t) => t.textContent)

describe('ColumnChart', () => {
  it('uses whole-number ticks for counts', () => {
    const { container } = render(<ColumnChart unit=" results" data={[{ label: 'a', value: 3 }, { label: 'b', value: 8 }]} />)
    const ticks = tickLabels(container).map(Number)
    expect(ticks.every(Number.isInteger)).toBe(true)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(8)
  })

  it('uses the given max for percentages and draws one bar per value', () => {
    const { container } = render(<ColumnChart max={100} data={[{ label: 'a', value: 40 }, { label: 'b', value: 0 }, { label: 'c', value: null }]} />)
    expect(tickLabels(container)).toEqual(['0', '25', '50', '75', '100'])
    expect(container.querySelectorAll('path').length).toBe(1) // zero and null draw no bar
    expect(container.textContent).toContain('n/a')
  })
})

describe('LineChart', () => {
  it('always labels the last point and right-aligns it', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `Day ${i + 1}`)
    const { container } = render(<LineChart labels={labels} series={[{ name: 'Avg', color: 'red', values: labels.map((_, i) => i * 5) }]} />)
    const xLabels = [...container.querySelectorAll('text')].filter((t) => t.textContent.startsWith('Day'))
    expect(xLabels.at(-1).textContent).toBe('Day 12')
    expect(xLabels.at(-1).getAttribute('text-anchor')).toBe('end')
    expect(xLabels.length).toBeLessThan(12)
  })

  it('shows a legend only for two or more series', () => {
    const one = render(<LineChart labels={['a', 'b']} series={[{ name: 'You', color: 'red', values: [1, 2] }]} />)
    expect(one.container.textContent).not.toContain('You')
    one.unmount()
    const two = render(<LineChart labels={['a', 'b']} series={[{ name: 'You', color: 'red', values: [1, 2] }, { name: 'Class', color: 'blue', values: [2, null] }]} />)
    expect(two.container.textContent).toContain('Class')
  })
})
