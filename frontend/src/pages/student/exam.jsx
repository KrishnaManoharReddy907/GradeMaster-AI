import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Clock, Info, Play, Send } from 'lucide-react'
import { Logo } from '@/components/AppShell'
import { Badge, Button, Callout, Card, CardBody, KeyValue } from '@/components/ui'
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
  const counts = { mcq: assessment.mcq_questions?.length, coding: assessment.coding_questions?.length, manual: assessment.manual_questions?.length }
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

export function useSubmittingRef() {
  const ref = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const begin = () => { if (ref.current) return false; ref.current = true; setSubmitting(true); return true }
  const end = () => { ref.current = false; setSubmitting(false) }
  return { submitting, begin, end }
}
