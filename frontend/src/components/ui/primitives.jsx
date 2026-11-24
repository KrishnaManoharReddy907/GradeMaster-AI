import { forwardRef, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Inbox, Loader2, RefreshCw, X } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

/* ─── Button ────────────────────────────────────────────────────────── */

const VARIANTS = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-card',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90 shadow-card',
  soft: 'bg-brand-soft text-brand hover:bg-brand-soft/70',
}
const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-[10px] justify-center',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, ...props }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150',
        'disabled:opacity-55 disabled:pointer-events-none select-none', VARIANTS[variant], SIZES[size], className)}
      {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  )
})

/* ─── Card ──────────────────────────────────────────────────────────── */

export function Card({ className, children, ...props }) {
  return <div className={cn('card', className)} {...props}>{children}</div>
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export const CardBody = ({ className, children }) => <div className={cn('p-5', className)}>{children}</div>

/* ─── Badge ─────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  brand: 'bg-brand-soft text-brand border-transparent',
  good: 'bg-good-soft text-good border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  info: 'bg-info-soft text-info border-transparent',
}

export function Badge({ tone = 'neutral', icon: Icon, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap',
      BADGE_TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  )
}

/* ─── Form controls ─────────────────────────────────────────────────── */

const controlBase = 'w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-colors focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand-soft disabled:bg-surface-2 disabled:text-ink-3'

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined}
    className={cn(controlBase, 'h-9', invalid && 'border-bad focus:border-bad focus:ring-bad-soft', className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined}
    className={cn(controlBase, 'py-2 leading-relaxed resize-y', invalid && 'border-bad', className)} {...props} />
})

export const Select = forwardRef(function Select({ className, children, invalid, ...props }, ref) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined}
      className={cn(controlBase, 'h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', invalid && 'border-bad', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2382807a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  )
})

/** Label + control + hint/error, wired with ids for accessibility. */
export function Field({ label, hint, error, required, children, className }) {
  const id = useId()
  const child = typeof children === 'function' ? children({ id, invalid: Boolean(error) }) : children
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={id} className="label block">{label}{required && <span className="text-bad"> *</span>}</label>}
      {child}
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : hint ? <p className="text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-[12.5px] text-ink-3">{description}</span>}
      </span>
    </label>
  )
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-[var(--brand)]" />
      {label}
    </label>
  )
}

/* ─── Segmented control / tabs ──────────────────────────────────────── */

export function Segmented({ value, onChange, options, className, size = 'md' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-[10px] border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink')}>
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
          {o.count !== undefined && <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
            value === t.value ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
          {t.icon && <t.icon className="h-4 w-4" />}
          {t.label}
          {t.count !== undefined && <span className="tabular rounded-full bg-surface-2 px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ─── Feedback states ───────────────────────────────────────────────── */

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-3', className)} aria-label="Loading" />
}

export const Skeleton = ({ className }) => <div className={cn('skeleton h-4', className)} aria-hidden />

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-ink-3"><Icon className="h-5 w-5" /></div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-bad-soft text-bad"><AlertCircle className="h-5 w-5" /></div>
      <p className="font-semibold">Couldn’t load this</p>
      <p className="mt-1 max-w-md text-[13px] text-ink-3">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

const CALLOUT_TONES = {
  info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad',
  good: 'bg-good-soft text-good', brand: 'bg-brand-soft text-brand',
}

export function Callout({ tone = 'info', icon: Icon, title, children, className }) {
  return (
    <div className={cn('flex gap-3 rounded-xl px-4 py-3', CALLOUT_TONES[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  )
}

/* ─── Layout helpers ────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions, eyebrow, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-in">
      <div className="min-w-0">
        {back}
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold leading-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-soft text-brand', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info', neutral: 'bg-surface-2 text-ink-2' }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
        </div>
        {Icon && <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', tones[tone])}><Icon className="h-[18px] w-[18px]" /></div>}
      </div>
    </Card>
  )
}

export function Progress({ value, max = 100, tone = 'brand', className, label }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const tones = { brand: 'bg-brand', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar"
      aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Avatar({ name, className }) {
  return (
    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand', className)}>
      {initials(name)}
    </span>
  )
}

export function KeyValue({ items, className }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12.5px] text-ink-3">{k}</dt>
          <dd className="mt-0.5 font-medium break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ─── Modal ─────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const panel = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => panel.current?.querySelector('input,textarea,select,button')?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panel} className={cn('animate-pop relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-pop sm:rounded-2xl', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <p className="text-ink-2">{message}</p>
    </Modal>
  )
}

/* ─── Table ─────────────────────────────────────────────────────────── */

export function Table({ columns, rows, rowKey = 'id', onRowClick, empty, className, dense }) {
  if (!rows?.length) return empty || <EmptyState title="Nothing here yet" />
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col"
                className={cn('px-4 py-2.5 text-[12px] font-medium text-ink-3 whitespace-nowrap', c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={typeof rowKey === 'function' ? rowKey(r, i) : r[rowKey] ?? i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2 focus:bg-surface-2 focus:outline-none')}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 align-middle', dense ? 'py-2' : 'py-3', c.align === 'right' && 'text-right tabular', c.cellClassName)}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
