import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CircleSlash, XCircle } from 'lucide-react'
import { Badge, Card, CardBody, ErrorState, PageHeader, PageSkeleton, ScorePill } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { cn, fmtDateTime, fmtPct, optionLabel } from '@/lib/utils'

export default function McqSubmission() {
  const { id } = useParams()
  const sub = useAsync(() => api.teacher.mcq(id), [id])
  useDocumentTitle(sub.data ? `${sub.data.student_name} · MCQ` : 'MCQ submission')
  if (sub.loading) return <PageSkeleton />
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />
  const s = sub.data
  const results = Object.fromEntries(s.results.map((r) => [r.question_id, r]))

  return (
    <>
      <PageHeader title={s.student_name} description={`${s.assessment_title} · submitted ${fmtDateTime(s.submitted_at)}`}
        back={<Link to={`/teacher/assessments/${s.assessment_id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back to assessment</Link>}
        actions={<div className="text-right"><ScorePill score={s.score} max={s.total_marks} className="text-xl" /><p className="text-[12.5px] text-ink-3">{fmtPct(s.percentage)} · auto-graded</p></div>} />
      <div className="space-y-3">
        {s.mcq_questions.map((q, i) => {
          const r = results[q.question_id] || {}
          return (
            <Card key={q.question_id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium"><span className="text-ink-3">{i + 1}.</span> {q.question_text}</p>
                  {r.is_correct ? <Badge tone="good" icon={CheckCircle2}>+{r.marks_obtained}</Badge> : r.selected_option_id ? <Badge tone="bad" icon={XCircle}>0 / {q.marks}</Badge> : <Badge icon={CircleSlash}>Not answered</Badge>}
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, oi) => {
                    const correct = o.option_id === q.correct_option_id
                    const chosen = o.option_id === r.selected_option_id
                    return (
                      <li key={o.option_id} className={cn('rounded-lg border px-3 py-2 text-[13px]',
                        correct ? 'border-good bg-good-soft' : chosen ? 'border-bad bg-bad-soft' : 'border-line')}>
                        <span className="font-semibold uppercase">{optionLabel(oi)}.</span> {o.text}
                        {correct && <span className="ml-1 text-good">· correct{chosen ? ", chosen" : ""}</span>}{chosen && !correct && <span className="ml-1 text-bad">· chosen</span>}
                      </li>
                    )
                  })}
                </ul>
                {r.ai_explanation && <p className="mt-3 text-[13px] text-ink-2">{r.ai_explanation}</p>}
              </CardBody>
            </Card>
          )
        })}
      </div>
    </>
  )
}
