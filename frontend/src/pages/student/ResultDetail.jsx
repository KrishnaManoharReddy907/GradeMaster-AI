import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CircleSlash, Clock, EyeOff, Hourglass, Lightbulb, Lock, MessageSquareQuote, XCircle } from 'lucide-react'
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton, ScorePill } from '@/components/ui'
import { CodeView, LANGUAGE_LABEL } from '@/components/code'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { cn, fmtDateTime, fmtNum, fmtPct, optionLabel } from '@/lib/utils'

function McqResult({ status }) {
  if (!status.results_visible) {
    return <Callout tone="info" icon={Clock} title="MCQ submitted">Your score and the answers will be shown after the assessment closes.</Callout>
  }
  const results = Object.fromEntries(status.mcq_results.map((r) => [r.question_id, r]))
  return (
    <Card>
      <CardHeader title="Multiple choice" action={<ScorePill score={status.mcq_score} max={status.mcq_total} className="text-lg" />} />
      <CardBody className="space-y-4">
        {status.mcq_questions.map((q, i) => {
          const r = results[q.question_id] || {}
          return (
            <div key={q.question_id} className="border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium"><span className="text-ink-3">{i + 1}.</span> {q.question_text}</p>
                {r.is_correct ? <Badge tone="good" icon={CheckCircle2}>Correct</Badge> : r.selected_option_id ? <Badge tone="bad" icon={XCircle}>Incorrect</Badge> : <Badge icon={CircleSlash}>Skipped</Badge>}
              </div>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o, oi) => (
                  <li key={o.option_id} className={cn('rounded-lg border px-3 py-1.5 text-[13px]',
                    o.option_id === q.correct_option_id ? 'border-good bg-good-soft' : o.option_id === r.selected_option_id ? 'border-bad bg-bad-soft' : 'border-line')}>
                    <span className="font-semibold uppercase">{optionLabel(oi)}.</span> {o.text}
                    {o.option_id === r.selected_option_id && <span className="ml-1 text-ink-3">(your answer)</span>}
                  </li>
                ))}
              </ul>
              {r.ai_explanation && <p className="mt-2 flex gap-2 text-[13px] text-ink-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{r.ai_explanation}</p>}
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}

function CodingResult({ sub, question }) {
  const final = sub.status === 'finalized'
  return (
    <Card>
      <CardHeader title={question?.title || 'Coding problem'} description={`${LANGUAGE_LABEL[sub.language] || sub.language} · submitted ${fmtDateTime(sub.submitted_at)}`}
        action={final ? <ScorePill score={sub.final_score} max={sub.max_marks} className="text-lg" /> : <Badge tone="info" icon={Hourglass}>Awaiting teacher review</Badge>} />
      <CardBody className="space-y-4">
        {final && sub.teacher_feedback && <Callout tone="brand" icon={MessageSquareQuote} title="Teacher’s comment">{sub.teacher_feedback}</Callout>}
        {sub.passed_tests !== undefined && sub.passed_tests !== null && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Tests: {sub.passed_tests} of {sub.total_tests} passed</p>
            <div className="flex flex-wrap gap-1.5">
              {(sub.issues?.test_results || []).map((t) => (
                <Badge key={t.test_case_index} tone={t.passed ? 'good' : 'bad'} icon={t.is_hidden ? EyeOff : t.passed ? CheckCircle2 : XCircle}>
                  Test {t.test_case_index + 1}{t.is_hidden ? ' (hidden)' : ''}</Badge>
              ))}
            </div>
          </div>
        )}
        {sub.ai_insights?.feedback && <div><p className="eyebrow mb-1">Feedback</p><p className="text-[13.5px] leading-relaxed">{sub.ai_insights.feedback}</p></div>}
        {sub.ai_insights?.code_fix?.corrected_code && (
          <details><summary className="cursor-pointer text-[13px] font-medium text-brand">Show a suggested fix</summary>
            {sub.ai_insights.code_fix.suggested_change && <p className="mt-2 text-[13px] text-ink-2">{sub.ai_insights.code_fix.suggested_change}</p>}
            <CodeView code={sub.ai_insights.code_fix.corrected_code} className="mt-2" maxHeight={300} /></details>
        )}
        {!final && !sub.ai_insights && <p className="text-[13px] text-ink-3">Detailed feedback becomes available after the assessment closes.</p>}
        <details><summary className="cursor-pointer text-[13px] text-ink-3">Your code</summary><CodeView code={sub.code} className="mt-2" maxHeight={360} /></details>
      </CardBody>
    </Card>
  )
}

function ManualResult({ result }) {
  if (result.status !== 'finalized') {
    return <Callout tone="info" icon={Hourglass} title="Submitted. Awaiting teacher review">Your answers were pre-scored automatically. Your teacher checks every score before results are released.</Callout>
  }
  return (
    <Card>
      <CardHeader title="Handwritten answers" description={`Reviewed ${fmtDateTime(result.reviewed_at)}`}
        action={<div className="text-right"><ScorePill score={result.final_score} max={result.total_marks} className="text-lg" /><p className="text-[12px] text-ink-3">{fmtPct(result.percentage)}</p></div>} />
      <CardBody className="space-y-5">
        {result.teacher_feedback && <Callout tone="brand" icon={MessageSquareQuote} title="Teacher’s comment">{result.teacher_feedback}</Callout>}
        {result.question_results.map((r, i) => (
          <div key={r.question_id} className="border-b border-line pb-5 last:border-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium"><span className="text-ink-3">Q{i + 1}.</span> {r.question_text}</p>
              <ScorePill score={r.score} max={r.max_marks} />
            </div>
            <div className="prose-answer mt-2 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">{r.student_answer || 'No answer'}</div>
            {r.teacher_comment && <p className="mt-2 text-[13px]"><span className="font-medium">Teacher: </span>{r.teacher_comment}</p>}
            {r.feedback && <p className="mt-2 flex gap-2 text-[13px] text-ink-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{r.feedback}</p>}
            {r.criteria?.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">{r.criteria.map((c) => <li key={c.criterion}>{c.criterion}: {fmtNum(c.awarded)} / {fmtNum(c.marks)}{c.comment ? ` · ${c.comment}` : ''}</li>)}</ul>}
            {r.keywords_missed?.length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">Key terms to include next time: {r.keywords_missed.map((k) => k.split('|')[0]).join(', ')}</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

export default function ResultDetail() {
  const { id } = useParams()
  const d = useAsync(async () => {
    const [list, status] = await Promise.all([api.student.assessments(), api.student.status(id)])
    const assessment = list.find((a) => a.id === id)
    const manual = status.manual_submitted ? await api.student.manualResult(id) : null
    let detail = null
    if (status.coding_submitted && assessment?.status !== 'upcoming') { try { detail = await api.student.assessment(id) } catch { /* paper hidden */ } }
    return { assessment, status, manual, detail }
  }, [id])
  useDocumentTitle(d.data?.assessment?.title || 'Result')
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  const { assessment, status, manual, detail } = d.data
  const nothing = !status.mcq_submitted && !status.coding_submitted && !status.manual_submitted

  return (
    <>
      <PageHeader title={assessment?.title || 'Result'} description={assessment ? `${assessment.subject_name} · ${assessment.total_marks} marks` : undefined}
        back={<Link to="/student/results" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Results</Link>}
        actions={assessment?.status === 'ended' && assessment.release_questions_after_deadline && <Link to={`/student/paper/${id}`} className="text-[13px] font-medium text-brand hover:underline">Question paper</Link>} />
      {nothing ? <Card><EmptyState icon={Lock} title="No submission" description="You haven’t submitted anything for this assessment." /></Card> : (
        <div className="space-y-6">
          {status.mcq_submitted && <McqResult status={status} />}
          {status.coding_submissions.map((s) => <CodingResult key={s.submission_id} sub={s} question={detail?.coding_questions?.find((q) => q.question_id === s.question_id)} />)}
          {manual && <ManualResult result={manual} />}
        </div>
      )}
    </>
  )
}
