import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge, Card, CardBody, ErrorState, PageHeader, PageSkeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { cn, optionLabel } from '@/lib/utils'

export default function ReleasedPaper() {
  const { id } = useParams()
  const p = useAsync(() => api.student.paper(id), [id])
  useDocumentTitle(p.data ? `${p.data.title} paper` : 'Question paper')
  if (p.loading) return <PageSkeleton />
  if (p.error) return <ErrorState error={p.error} onRetry={p.reload} />
  const d = p.data
  let n = 0
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.title} description="Released question paper for revision."
        back={<Link to="/student/assessments" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Assessments</Link>} />
      <div className="space-y-3">
        {d.mcq_questions.map((q) => (
          <Card key={q.question_id}><CardBody>
            <p className="font-medium"><span className="text-ink-3">{++n}.</span> {q.question_text}</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{q.options.map((o, oi) => (
              <li key={o.option_id} className={cn('rounded-lg border px-3 py-1.5 text-[13px]', o.option_id === q.correct_option_id ? 'border-good bg-good-soft font-medium' : 'border-line')}>
                {optionLabel(oi)}. {o.text}</li>))}</ul>
            {q.explanation && <p className="mt-2 text-[13px] text-ink-2">{q.explanation}</p>}
          </CardBody></Card>
        ))}
        {d.coding_questions.map((q) => (
          <Card key={q.question_id}><CardBody>
            <div className="flex items-start justify-between gap-3"><p className="font-medium"><span className="text-ink-3">{++n}.</span> {q.title}</p><Badge>{q.marks} marks</Badge></div>
            <p className="prose-answer mt-2 text-[13.5px] text-ink-2">{q.problem_statement}</p>
          </CardBody></Card>
        ))}
        {d.manual_questions.map((q) => (
          <Card key={q.question_id}><CardBody>
            <div className="flex items-start justify-between gap-3"><p className="font-medium"><span className="text-ink-3">{++n}.</span> {q.question_text}</p><Badge>{q.marks} marks</Badge></div>
          </CardBody></Card>
        ))}
      </div>
    </div>
  )
}
