import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bookmark, ChevronLeft, ChevronRight, Eraser } from 'lucide-react'
import { Badge, Button, ConfirmDialog, ErrorState, PageSkeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, usePersistentState } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn, optionLabel } from '@/lib/utils'
import { ExamShell, StartGate, useDeadline, useLeaveGuard, useSubmittingRef } from './exam'

export default function TakeMcq() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const a = useAsync(() => api.student.assessment(id), [id])
  useDocumentTitle(a.data?.title)
  const [attempt, setAttempt] = useState(null)
  const [starting, setStarting] = useState(false)
  const [answers, setAnswers, clearAnswers] = usePersistentState(`gm-mcq-${id}`, {})
  const [flags, setFlags, clearFlags] = usePersistentState(`gm-mcq-flags-${id}`, {})
  const [current, setCurrent] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const { submitting, begin, end } = useSubmittingRef()
  const remaining = useDeadline(attempt)
  useLeaveGuard(Boolean(attempt))

  const questions = a.data?.mcq_questions || []
  const backAllowed = a.data?.rules?.allow_back_navigation !== false
  const answered = Object.keys(answers).filter((k) => questions.some((q) => q.question_id === k)).length

  useEffect(() => { if (a.data?.attempt) setAttempt({ ...a.data.attempt, server_time: null }) }, [a.data])

  const start = async () => {
    setStarting(true)
    try { setAttempt(await api.student.start(id)) } catch (e) { toast.error(e) } finally { setStarting(false) }
  }

  const submit = useCallback(async (auto = false) => {
    if (!begin()) return
    try {
      const payload = Object.entries(answers).filter(([qid]) => questions.some((q) => q.question_id === qid))
        .map(([question_id, selected_option_id]) => ({ question_id, selected_option_id }))
      const res = await api.student.submitMcq(id, payload)
      clearAnswers(); clearFlags()
      toast.success(res.results_visible ? `You scored ${res.score} / ${res.total_marks}` : 'Your answers were submitted. Results appear after the assessment closes.',
        auto ? 'Time’s up: submitted automatically' : 'Submitted')
      navigate(`/student/results/${id}`, { replace: true })
    } catch (e) {
      if (e.status === 409) { clearAnswers(); navigate(`/student/results/${id}`, { replace: true }); return }
      toast.error(e)
      end()
    }
  }, [answers, questions, id, begin, end, clearAnswers, clearFlags, navigate, toast])

  useEffect(() => { if (attempt && remaining !== null && remaining <= 0) submit(true) }, [remaining, attempt, submit])

  const q = questions[current]
  const status = useMemo(() => questions.map((qq) => (answers[qq.question_id] ? (flags[qq.question_id] ? 'review-answered' : 'answered') : flags[qq.question_id] ? 'review' : 'none')), [questions, answers, flags])

  if (a.loading) return <div className="p-8"><PageSkeleton /></div>
  if (a.error) return <div className="p-8"><ErrorState error={a.error} onRetry={a.reload} /></div>
  if (!attempt) return <StartGate assessment={a.data} kind="mcq" onStart={start} starting={starting} />

  return (
    <ExamShell title={a.data.title} subtitle={`${answered} of ${questions.length} answered`} remaining={remaining}
      onSubmit={() => setConfirm(true)} submitting={submitting} saved="Saved on this device">
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_280px]">
        <section aria-label={`Question ${current + 1}`} className="card p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="eyebrow">Question {current + 1} of {questions.length}</p>
            <Badge>{q.marks} mark{q.marks === 1 ? '' : 's'}</Badge>
          </div>
          <h2 className="text-[17px] font-medium leading-relaxed">{q.question_text}</h2>
          <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Options">
            {q.options.map((o, oi) => {
              const selected = answers[q.question_id] === o.option_id
              return (
                <button key={o.option_id} role="radio" aria-checked={selected} onClick={() => setAnswers({ ...answers, [q.question_id]: o.option_id })}
                  className={cn('flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    selected ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[12.5px] font-semibold uppercase',
                    selected ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong text-ink-3')}>{optionLabel(oi)}</span>
                  <span className="pt-0.5">{o.text}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" icon={Eraser} disabled={!answers[q.question_id]}
                onClick={() => { const n = { ...answers }; delete n[q.question_id]; setAnswers(n) }}>Clear</Button>
              <Button variant={flags[q.question_id] ? 'soft' : 'ghost'} size="sm" icon={Bookmark}
                onClick={() => setFlags({ ...flags, [q.question_id]: !flags[q.question_id] })}>{flags[q.question_id] ? 'Marked for review' : 'Mark for review'}</Button>
            </div>
            <div className="flex gap-2">
              {backAllowed && <Button variant="secondary" icon={ChevronLeft} disabled={current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>}
              {current < questions.length - 1
                ? <Button onClick={() => setCurrent(current + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
                : <Button onClick={() => setConfirm(true)}>Review & submit</Button>}
            </div>
          </div>
        </section>
        <aside className="card h-fit p-4 lg:sticky lg:top-20">
          <p className="mb-3 text-[13px] font-medium">Questions</p>
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((qq, i) => (
              <button key={qq.question_id} onClick={() => (backAllowed || i > current) && setCurrent(i)} aria-label={`Question ${i + 1}, ${status[i].replace('-', ' ')}`}
                aria-current={i === current}
                className={cn('relative grid h-9 place-items-center rounded-lg border text-[12.5px] font-medium tabular transition-colors',
                  status[i].includes('answered') ? 'border-brand bg-brand text-brand-ink' : 'border-line hover:bg-surface-2',
                  i === current && 'ring-2 ring-brand ring-offset-2 ring-offset-surface')}>
                {i + 1}
                {status[i].startsWith('review') && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-warn" />}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-[12px] text-ink-3">
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-brand" />Answered ({answered})</li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-line" />Not answered ({questions.length - answered})</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warn" />Marked for review</li>
          </ul>
        </aside>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={submitting} confirmLabel="Submit answers"
        title="Submit your answers?" onConfirm={() => submit(false)}
        message={answered < questions.length
          ? `You’ve answered ${answered} of ${questions.length} questions. Unanswered questions score zero. You can’t change answers after submitting.`
          : 'All questions answered. You can’t change answers after submitting.'} />
    </ExamShell>
  )
}
