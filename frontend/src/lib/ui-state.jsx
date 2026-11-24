import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { cn } from './utils'

/* ─── Theme ─────────────────────────────────────────────────────────── */

const ThemeContext = createContext(null)

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('gm-theme') || systemTheme() } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('gm-theme', theme) } catch { /* ignore */ }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

/* ─── Toasts ────────────────────────────────────────────────────────── */

const ToastContext = createContext(null)
const ICONS = { success: CheckCircle2, error: XCircle, warning: TriangleAlert, info: Info }
const TONES = { success: 'text-good', error: 'text-bad', warning: 'text-warn', info: 'text-info' }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const id = useRef(0)
  const dismiss = useCallback((tid) => setToasts((t) => t.filter((x) => x.id !== tid)), [])
  const push = useCallback((type, message, title) => {
    const tid = ++id.current
    setToasts((t) => [...t.slice(-3), { id: tid, type, message, title }])
    setTimeout(() => dismiss(tid), type === 'error' ? 7000 : 4000)
  }, [dismiss])
  const toast = useMemo(() => ({
    success: (m, t) => push('success', m, t),
    error: (m, t) => push('error', typeof m === 'string' ? m : m?.message || 'Something went wrong', t),
    warning: (m, t) => push('warning', m, t),
    info: (m, t) => push('info', m, t),
  }), [push])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
              className="animate-pop card flex items-start gap-3 px-4 py-3 shadow-pop">
              <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', TONES[t.type])} aria-hidden />
              <div className="min-w-0 flex-1">
                {t.title && <p className="font-semibold">{t.title}</p>}
                <p className="text-ink-2">{t.message}</p>
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-3 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
