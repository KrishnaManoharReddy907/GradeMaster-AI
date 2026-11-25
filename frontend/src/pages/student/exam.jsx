import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Clock, Info, Maximize, Play, Send, ShieldAlert } from 'lucide-react'
import { Logo } from '@/components/AppShell'
import { Badge, Button, Callout, Card, CardBody, KeyValue } from '@/components/ui'
import { api } from '@/lib/api'
import { useNow } from '@/lib/hooks'
import { cn, duration, fmtDateTime, TYPE_LABELS } from '@/lib/utils'

/** Remaining milliseconds until the personal deadline, corrected for client clock skew. */
export function useDeadline(attempt) {
  const offset = useRef(0)
  useEffect(() => {
    if (attempt?.server_time) offset.current = new Date(attempt.server_time).getTime() - Date.now()
  }, [attempt])
  const now = useNow(500)
  if (!attempt?.deadline) return null
  return new Date(attempt.deadline).getTime() - (now + offset.current)
}

export function useLeaveGuard(active) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}

export function Timer({ remaining }) {
  if (remaining === null) return null
  const low = remaining < 5 * 60 * 1000
  const critical = remaining < 60 * 1000
  return (
    <span role="timer" aria-live={critical ? 'assertive' : 'off'}
      className={cn('inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 font-mono text-[14px] font-semibold tabular',
        critical ? 'border-bad bg-bad-soft text-bad' : low ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-surface')}>
      <Clock className="h-4 w-4" aria-hidden />{duration(remaining)}
    </span>
  )
}

export function ExamShell({ title, subtitle, remaining, onSubmit, submitting, submitLabel = 'Submit', children, saved }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-15 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <div className="hidden sm:block"><Logo /></div>
          <div className="min-w-0 flex-1 sm:border-l sm:border-line sm:pl-4">
            <p className="truncate font-semibold">{title}</p>
            {subtitle && <p className="truncate text-[12px] text-ink-3">{subtitle}</p>}
          </div>
          {saved && <span className="hidden text-[12px] text-ink-3 md:inline">{saved}</span>}
          <Timer remaining={remaining} />
          <Button icon={Send} loading={submitting} onClick={onSubmit}>{submitLabel}</Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}

/** Instructions screen shown before the clock starts. */
export function StartGate({ assessment, onStart, starting, kind }) {
  const timed = Boolean(assessment.duration_minutes)
  const counts = { mcq: assessment.mcq_questions?.length, coding: assessment.coding_questions?.length, manual: assessment.manual_questions?.length,
    mixed: `${assessment.mcq_questions?.length || 0} MCQ + ${assessment.coding_questions?.length || 0} coding` }
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 animate-in">
      <Link to="/student/assessments" className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Assessments</Link>
      <Card>
        <CardBody className="space-y-5">
          <div>
            <Badge tone="brand">{TYPE_LABELS[assessment.assessment_type]}</Badge>
            <h1 className="mt-2 text-2xl font-semibold">{assessment.title}</h1>
            {assessment.description && <p className="mt-1 text-ink-2">{assessment.description}</p>}
          </div>
          <KeyValue items={[
            ['Subject', assessment.subject_name], ['Total marks', assessment.total_marks],
            ['Questions', counts[kind] ?? '—'], ['Time allowed', timed ? `${assessment.duration_minutes} minutes` : 'Until the closing time'],
            ['Closes', fmtDateTime(assessment.end_time)],
          ]} />
          {assessment.instructions && <Callout tone="info" icon={Info} title="Instructions"><p className="prose-answer">{assessment.instructions}</p></Callout>}
          {isProctored(assessment) && (
            <Callout tone="bad" icon={ShieldAlert} title="Proctored exam">
              The exam opens in fullscreen. Leaving fullscreen, switching tabs or apps, or reloading the page counts as a violation.
              After {assessment.rules.max_violations || 3} violations your answers are submitted automatically. Your teacher sees every violation.
            </Callout>
          )}
          {timed && (
            <Callout tone="warn" icon={AlertTriangle}>
              Your {assessment.duration_minutes}-minute clock starts when you press Start and keeps running if you close the page.
              Your answers are saved on this device as you go and submitted automatically when time runs out.
            </Callout>
          )}
          <Button size="lg" className="w-full" icon={Play} loading={starting} onClick={onStart}>{assessment.attempt ? 'Resume' : 'Start'}</Button>
        </CardBody>
      </Card>
    </div>
  )
}

/* ─── Proctoring ─────────────────────────────────────────────────────────
 * The browser can detect (not prevent) leaving fullscreen, switching tabs and clicking
 * other apps. Each event is reported to the server, which keeps the count; at the limit the
 * attempt is closed and the page submits what the student has. */

export const fullscreenSupported = () =>
  typeof document !== 'undefined' && Boolean(document.documentElement?.requestFullscreen) && document.fullscreenEnabled !== false

export function enterFullscreen() {
  try {
    if (fullscreenSupported() && !document.fullscreenElement) return document.documentElement.requestFullscreen().catch(() => {})
  } catch { /* not allowed */ }
  return Promise.resolve()
}

export function exitFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) } catch { /* ignore */ }
}

export const isProctored = (assessment) => Boolean(assessment?.rules?.proctoring_enabled)

/**
 * attempt.resumed = the attempt existed before this page load (reload, closed tab, re-login):
 * that counts as a violation once, and the exam stays covered until fullscreen is back.
 */
export function useProctoring({ assessmentId, assessment, attempt, onTerminate }) {
  const enabled = isProctored(assessment) && Boolean(attempt)
  const [state, setState] = useState(attempt?.proctoring || null)
  const [blocked, setBlocked] = useState(false)
  const last = useRef(0)
  const terminated = useRef(false)
  const resumeReported = useRef(false)
  const terminateRef = useRef(onTerminate)
  useEffect(() => { terminateRef.current = onTerminate })
  useEffect(() => { if (attempt?.proctoring) setState(attempt.proctoring) }, [attempt])

  const finish = useCallback(() => {
    if (terminated.current) return
    terminated.current = true
    setBlocked(false)
    terminateRef.current?.()
  }, [])

  const report = useCallback(async (type) => {
    const now = Date.now()
    if (now - last.current < 1500 || terminated.current) return   // one action often fires several events
    last.current = now
    try {
      const s = await api.student.proctorEvent(assessmentId, type)
      setState(s)
      if (s?.terminated) finish()
    } catch { /* offline: the next event or the resume check will catch up */ }
  }, [assessmentId, finish])

  useEffect(() => {
    if (!enabled) return undefined
    if (state?.terminated) { finish(); return undefined }
    if (attempt.resumed && !resumeReported.current) {
      resumeReported.current = true
      report('reentered')
      setBlocked(true)
    } else if (fullscreenSupported() && !document.fullscreenElement) {
      setBlocked(true)
    }
    const onFs = () => { if (fullscreenSupported() && !document.fullscreenElement) { setBlocked(true); report('fullscreen_exit') } }
    const onVis = () => { if (document.hidden) { setBlocked(true); report('tab_hidden') } }
    let blurTimer
    const onBlur = () => {
      clearTimeout(blurTimer)
      blurTimer = setTimeout(() => { if (!document.hasFocus() && !document.hidden) { setBlocked(true); report('window_blur') } }, 800)
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    return () => {
      clearTimeout(blurTimer)
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => exitFullscreen(), [])   // leaving the exam page always leaves fullscreen

  const resume = useCallback(async () => {
    await enterFullscreen()
    if (!fullscreenSupported() || document.fullscreenElement) setBlocked(false)
  }, [])

  return { enabled, state, blocked: enabled && blocked && !terminated.current, resume }
}

/** Covers the exam (timer still visible in the header) until the student returns to fullscreen. */
export function ProctorOverlay({ proctor, remaining }) {
  // While covered, the exam underneath can't be focused, typed into or clicked.
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined
    if (proctor.blocked) root.setAttribute('inert', '')
    else root.removeAttribute('inert')
    return () => root.removeAttribute('inert')
  }, [proctor.blocked])
  if (!proctor.blocked) return null
  const v = proctor.state?.violations ?? 0
  const max = proctor.state?.max_violations ?? 3
  const left = Math.max(0, max - v)
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-canvas/97 p-4 backdrop-blur" role="alertdialog" aria-modal="true" aria-labelledby="proctor-title">
      <div className="card w-full max-w-md space-y-4 p-6 text-center shadow-pop">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warn-soft text-warn"><ShieldAlert className="h-6 w-6" /></span>
        <div>
          <h2 id="proctor-title" className="text-lg font-semibold">{v ? `Warning ${v} of ${max}` : 'Fullscreen required'}</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {v ? 'You left the exam window. ' : 'This exam runs in fullscreen. '}
            {left > 0 ? <>After <b>{left}</b> more {left === 1 ? 'time' : 'times'} your exam is submitted automatically.</> : 'Your exam is being submitted.'}
          </p>
        </div>
        {remaining !== null && <div className="flex justify-center"><Timer remaining={remaining} /></div>}
        <p className="text-[12.5px] text-ink-3">The timer keeps running while this message is shown.</p>
        <Button size="lg" className="w-full" icon={Maximize} onClick={proctor.resume}>
          {fullscreenSupported() ? 'Return to fullscreen' : 'Continue exam'}
        </Button>
      </div>
    </div>,
    document.body,
  )
}

export function useSubmittingRef() {
  const ref = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const begin = () => { if (ref.current) return false; ref.current = true; setSubmitting(true); return true }
  const end = () => { ref.current = false; setSubmitting(false) }
  return { submitting, begin, end }
}
