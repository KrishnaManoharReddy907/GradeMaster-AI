import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load data on mount (and when deps change) with loading / error / reload.
 * Ignores responses from stale requests.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const seq = useRef(0)
  const run = useCallback(async () => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fn()
      if (id === seq.current) setState({ data, error: null, loading: false })
      return data
    } catch (error) {
      if (id === seq.current) setState({ data: null, error, loading: false })
      return undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  const setData = useCallback((updater) => setState((s) => ({
    ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), [])
  return { ...state, reload: run, setData }
}

/** Wrap an async action with a pending flag. */
export function useAction(fn) {
  const [pending, setPending] = useState(false)
  const run = useCallback(async (...args) => {
    setPending(true)
    try { return await fn(...args) } finally { setPending(false) }
  }, [fn])
  return [run, pending]
}

/** Re-render every `ms` milliseconds (clocks, countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** State persisted in localStorage (drafts, preferences). Never throws. */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota/private */ }
  }, [key, value])
  const clear = useCallback(() => { try { localStorage.removeItem(key) } catch { /* ignore */ } }, [key])
  return [value, setValue, clear]
}

/** Poll a background job until it finishes. */
export function useJobPoll(fetchJob, onDone) {
  const timer = useRef(null)
  const stop = useCallback(() => clearTimeout(timer.current), [])
  const start = useCallback((jobId) => {
    stop()
    let delay = 1200
    const tick = async () => {
      try {
        const job = await fetchJob(jobId)
        if (job.status === 'done' || job.status === 'failed') { onDone(job); return }
      } catch { /* transient; keep polling */ }
      delay = Math.min(delay * 1.4, 5000)
      timer.current = setTimeout(tick, delay)
    }
    timer.current = setTimeout(tick, delay)
  }, [fetchJob, onDone, stop])
  useEffect(() => stop, [stop])
  return start
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · GradeMaster` : 'GradeMaster'
  }, [title])
}
