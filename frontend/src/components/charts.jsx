/**
 * Lightweight SVG charts following the dataviz method:
 * thin marks (bars ≤ 24px, 4px rounded data-end), 2px lines, ≥ 8px end dots with a
 * 2px surface ring, hairline recessive grid, hover tooltips, text in ink tokens
 * (never series colour), legend only for ≥ 2 series, and a table view on every chart
 * (the relief rule for the light-mode contrast WARN on slots 3–5).
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Card, Segmented, Table } from './ui'
import { cn, fmtNum } from '@/lib/utils'

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return undefined
    const el = ref.current
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function niceMax(v) {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

function Tooltip({ x, y, width, children }) {
  if (x === null) return null
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
      style={{ left, top: y - 8 }}>
      {children}
    </div>
  )
}

const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Single-series columns. data: [{ label, value, sub? }] */
export function ColumnChart({ data, height = 220, max, unit = '%', color = 'var(--series-1)' }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { top: 12, right: 8, bottom: 44, left: 36 }
  const innerW = Math.max(0, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const integer = unit !== '%'
  const rawTop = max ?? niceMax(Math.max(...data.map((d) => d.value ?? 0), 0))
  // Count data gets whole-number ticks (never "2.5 students").
  const step = integer ? Math.max(1, Math.ceil(rawTop / 4)) : rawTop / 4
  const top = integer ? step * 4 : rawTop
  const band = data.length ? innerW / data.length : 0
  const barW = Math.min(24, band * 0.6)
  const ticks = [0, 1, 2, 3, 4].map((t) => t * step)
  const y = (v) => pad.top + innerH - (v / top) * innerH

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Column chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize="11" fill="var(--ink-3)">{fmtNum(t, 0)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2
            const v = d.value ?? 0
            const h = Math.max(0, (v / top) * innerH)
            const r = Math.min(4, h, barW / 2)
            const x0 = cx - barW / 2
            const y0 = pad.top + innerH - h
            const path = h > 0
              ? `M${x0},${y0 + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${y0 + h} Z`
              : ''
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" />
                {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {d.value === null && <text x={cx} y={pad.top + innerH - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">n/a</text>}
                <text x={cx} y={height - pad.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                  {truncate(d.label, Math.max(4, Math.floor(band / 7)))}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={pad.left + band * hover + band / 2} y={y(data[hover].value ?? 0)} width={width}>
          <p className="font-medium text-ink">{data[hover].label}</p>
          <p className="tabular text-ink-2">{data[hover].value === null ? 'No data' : `${fmtNum(data[hover].value)}${unit}`}{data[hover].sub ? ` · ${data[hover].sub}` : ''}</p>
        </Tooltip>
      )}
    </div>
  )
}

/** Line chart with up to 2 series and a crosshair tooltip. series: [{ name, color, values:[number|null] }] */
export function LineChart({ labels, series, height = 230, max = 100, unit = '%' }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { top: 14, right: 16, bottom: 32, left: 36 }
  const innerW = Math.max(0, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const n = labels.length
  const x = (i) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v) => pad.top + innerH - (v / max) * innerH
  const ticks = [0, 25, 50, 75, 100].map((t) => (t / 100) * max)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 90))))
  // Show every Nth label plus the last one, dropping a regular label that would crowd the last.
  const showLabel = (i) => i === n - 1 || (i % labelEvery === 0 && (n - 1 - i) >= labelEvery * 0.75)
  const anchor = (i) => (n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle')

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = n <= 1 ? 0 : Math.round(((px - pad.left) / innerW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Line chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" className="tabular" fill="var(--ink-3)">{fmtNum(t, 0)}</text>
              </g>
            ))}
            {labels.map((l, i) => showLabel(i) && (
              <text key={i} x={x(i)} y={height - 10} textAnchor={anchor(i)} fontSize="11" fill="var(--ink-3)">{truncate(l, 14)}</text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--line-strong)" />}
            {series.map((s) => {
              const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v)]))
              const d = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]} ` : acc), '')
              const last = [...pts].reverse().find(Boolean)
              return (
                <g key={s.name}>
                  {s.area && last && <path d={`${d}L${last[0]},${pad.top + innerH} L${pts.find(Boolean)[0]},${pad.top + innerH} Z`} fill={s.color} opacity="0.1" />}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {last && <circle cx={last[0]} cy={last[1]} r="4" fill={s.color} stroke="var(--chart-surface)" strokeWidth="2" />}
                  {hover !== null && pts[hover] && <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill={s.color} stroke="var(--chart-surface)" strokeWidth="2" />}
                </g>
              )
            })}
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={x(hover)} y={pad.top + 10} width={width}>
            <p className="font-medium text-ink">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="tabular flex items-center gap-1.5 text-ink-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {series.length > 1 && <span>{s.name}:</span>}
                {s.values[hover] === null || s.values[hover] === undefined ? '—' : `${fmtNum(s.values[hover])}${unit}`}
              </p>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** Horizontal bars with the value at the tip. rows: [{ label, value, max?, aside? }] */
export function BarList({ rows, max = 100, unit = '%', color = 'var(--series-1)' }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = Math.max(0, Math.min(100, ((r.value ?? 0) / (r.max ?? max)) * 100))
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-medium" title={r.label}>{r.label}</span>
              <span className="flex shrink-0 items-center gap-2">{r.aside}<span className="tabular text-ink-2">{fmtNum(r.value)}{unit}</span></span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? 4 : 0 }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Card wrapper with a Chart / Table toggle. */
export function ChartCard({ title, description, columns, rows, children, action, className, empty }) {
  const [view, setView] = useState('chart')
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {rows?.length > 0 && (
            <Segmented size="sm" value={view} onChange={setView} options={[
              { value: 'chart', label: 'Chart', icon: BarChart3 }, { value: 'table', label: 'Table', icon: Table2 }]} />
          )}
        </div>
      </div>
      <div className="flex-1 px-5 pb-5 pt-3">
        {!rows?.length ? empty : view === 'chart' ? children : <Table columns={columns} rows={rows} rowKey={(r, i) => i} dense />}
      </div>
    </Card>
  )
}
