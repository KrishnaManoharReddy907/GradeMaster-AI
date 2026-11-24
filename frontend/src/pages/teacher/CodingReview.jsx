import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, Bug, CheckCircle2, EyeOff, Fingerprint, History, Lock, Play, Sparkles, XCircle } from 'lucide-react'
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, FlagChips, Input, PageHeader, PageSkeleton,
  ScorePill, SubmissionStatus, Textarea,
} from '@/components/ui'
import { CodeView, LANGUAGE_LABEL } from '@/components/code'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, useJobPoll } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn, fmtDateTime, fmtNum } from '@/lib/utils'

function TestRow({ t }) {
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          {t.passed ? <CheckCircle2 className="h-4 w-4 text-good" /> : <XCircle className="h-4 w-4 text-bad" />}
          Test {t.test_case_index + 1}
          {t.is_hidden && <Badge icon={EyeOff}>Hidden</Badge>}
        </span>
        <span className="text-[12px] text-ink-3">{t.status_description}{t.time ? ` · ${t.time}s` : ''}</span>
      </div>
      {!t.is_hidden && !t.passed && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[['Input', t.input], ['Expected', t.expected_output], ['Got', t.actual_output]].map(([k, v]) => (
            <div key={k}><p className="mb-1 text-[11.5px] text-ink-3">{k}</p><pre className="code-block max-h-32 overflow-auto">{v || '(empty)'}</pre></div>
          ))}
        </div>
      )}
      {(t.stderr || t.compile_output) && <pre className="code-block mt-2 max-h-40 overflow-auto text-bad">{t.compile_output || t.stderr}</pre>}
    </li>
  )
}

export default function CodingReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const sub = useAsync(() => api.teacher.coding(id), [id])
  useDocumentTitle(sub.data ? `${sub.data.student_name} · code review` : 'Code review')
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  useEffect(() => {
    if (!sub.data) return
    const e = sub.data.evaluation
    setScore(e.final_score ?? e.ai_score ?? '')
    setFeedback(sub.data.feedback.teacher_feedback || '')
  }, [sub.data])

  const onJobDone = useCallback((job) => {
    setEvaluating(false)
    if (job.status === 'done') toast.success('Evaluation finished')
    else toast.error(job.error || 'Evaluation failed')
    sub.reload()
  }, [toast, sub])
  const poll = useJobPoll(api.teacher.job, onJobDone)

  const evaluate = async () => {
    setEvaluating(true)
    try { const r = await api.teacher.evaluate(id); poll(r.job.id) } catch (err) { toast.error(err); setEvaluating(false) }
  }

  const save = async (andFinalize) => {
    setSaving(true)
    try {
      await api.teacher.review(id, Number(score), feedback || null)
      if (andFinalize) {
        await api.teacher.finalize(id)
        toast.success('Grade finalized and released to the student')
        setFinalizeOpen(false)
      } else toast.success('Review saved')
      sub.reload()
    } catch (err) { toast.error(err) } finally { setSaving(false) }
  }

  if (sub.loading) return <PageSkeleton />
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />
  const s = sub.data
  const e = s.evaluation
  const finalized = e.status === 'finalized'
  const evaluated = ['evaluated', 'reviewed', 'finalized'].includes(e.status)
  const plag = s.analysis?.plagiarism
  const fix = s.corrections?.code_fix || {}
  const tests = s.issues?.test_results || []
  const max = e.max_marks || s.question?.marks || 0
  const scoreInvalid = score === '' || Number(score) < 0 || Number(score) > max

  return (
    <>
      <PageHeader title={s.student_name || 'Student'} description={`${s.assessment_title} · ${s.question?.title || s.question_id}`}
        back={<Link to={`/teacher/assessments/${s.assessment_id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back to assessment</Link>}
        actions={<><SubmissionStatus status={e.status} />
          {!finalized && e.status !== 'reviewed' && <Button variant="secondary" icon={Play} loading={evaluating || e.status === 'evaluating'} onClick={evaluate}>{evaluated ? 'Re-run evaluation' : 'Run evaluation'}</Button>}</>} />

      {s.review_flags?.length > 0 && <div className="mb-4"><FlagChips flags={s.review_flags} max={6} /></div>}
      {e.error && <Callout tone="bad" className="mb-4" title="Evaluation failed">{e.error}</Callout>}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Submitted code" description={`${LANGUAGE_LABEL[s.language] || s.language} · submitted ${fmtDateTime(s.submitted_at)}`} />
            <CardBody><CodeView code={s.code} maxHeight={460} /></CardBody>
          </Card>
          {evaluated && (
            <Card>
              <CardHeader title="Test results" description={`${e.passed_tests} of ${e.total_tests} passed`} />
              <CardBody>{tests.length
                ? <ul className="space-y-2">{tests.map((t) => <TestRow key={t.test_case_index} t={t} />)}</ul>
                : <p className="text-[13px] text-ink-3">Per-test details weren’t recorded for this run. Re-run the evaluation to see them.</p>}</CardBody>
            </Card>
          )}
          {evaluated && fix.corrected_code && (
            <Card>
              <CardHeader title="Suggested minimal fix" description="AI-generated; check it before sharing." action={<Badge tone="brand" icon={Sparkles}>AI</Badge>} />
              <CardBody className="space-y-3">
                {fix.suggested_change && <p className="text-ink-2"><span className="font-medium text-ink">Change: </span>{fix.suggested_change}</p>}
                <CodeView code={fix.corrected_code} maxHeight={320} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Grade" description={finalized ? 'Finalized and visible to the student.' : 'The AI score is a suggestion. Your score is what counts.'} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[12px] text-ink-3">AI score</p><ScorePill score={e.ai_score} max={max} className="text-lg" /></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[12px] text-ink-3">Accuracy</p><p className="text-lg font-semibold">{evaluated ? `${fmtNum(e.accuracy_score)}%` : '—'}</p></div>
              </div>
              {finalized ? (
                <Callout tone="good" icon={Lock} title={`Final score: ${fmtNum(e.final_score, 2)} / ${fmtNum(max, 2)}`}>
                  {s.feedback.teacher_feedback || 'No teacher comment.'}
                </Callout>
              ) : (
                <>
                  <Field label={`Your score (out of ${fmtNum(max, 2)})`} error={score !== '' && scoreInvalid ? `Enter a score between 0 and ${max}` : null}>
                    {({ id: fid, invalid }) => <Input id={fid} type="number" step="0.5" min={0} max={max} invalid={invalid} value={score} onChange={(ev) => setScore(ev.target.value)} />}
                  </Field>
                  <Field label="Comment for the student">{({ id: fid }) => <Textarea id={fid} rows={3} value={feedback} onChange={(ev) => setFeedback(ev.target.value)} />}</Field>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" loading={saving} disabled={scoreInvalid} onClick={() => save(false)}>Save draft</Button>
                    <Button className="flex-1" icon={Lock} disabled={scoreInvalid || !evaluated} onClick={() => setFinalizeOpen(true)}>Finalize</Button>
                  </div>
                </>
              )}
              {s.review.review_history?.length > 0 && (
                <details className="text-[13px]">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-ink-3"><History className="h-3.5 w-3.5" />Score history ({s.review.review_history.length})</summary>
                  <ul className="mt-2 space-y-1.5">{s.review.review_history.map((h, i) => (
                    <li key={i} className="text-ink-2">{fmtDateTime(h.timestamp)}: {h.old_score ?? '—'} → {h.new_score}{h.comment ? ` · “${h.comment}”` : ''}</li>))}</ul>
                </details>
              )}
            </CardBody>
          </Card>

          {evaluated && (
            <Card>
              <CardHeader title="Feedback" action={s.feedback.source === 'ai'
                ? <Badge tone="brand" icon={Bot}>AI-written</Badge> : s.feedback.source ? <Badge>Rule-based</Badge> : null} />
              <CardBody className="space-y-3 text-[13.5px]">
                <p className="leading-relaxed">{s.feedback.ai_feedback || 'No feedback generated.'}</p>
                {s.issues?.bugs?.length > 0 && (
                  <div><p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><Bug className="h-3.5 w-3.5" />Detected issues</p>
                    <div className="flex flex-wrap gap-1.5">{s.issues.bugs.map((b) => <Badge key={b} tone="warn">{b}</Badge>)}</div></div>
                )}
                {s.analysis?.code_quality?.notes?.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-ink-2">{s.analysis.code_quality.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
              </CardBody>
            </Card>
          )}

          {evaluated && plag && (
            <Card>
              <CardHeader title="Similarity" />
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-ink-3" />Closest match</span>
                  <Badge tone={plag.level === 'high' ? 'bad' : plag.level === 'moderate' ? 'warn' : 'good'}>{plag.score}% · {plag.level}</Badge>
                </div>
                {plag.similar_submission_id && plag.score >= 60 && (
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate(`/teacher/plagiarism?a=${id}&b=${plag.similar_submission_id}`)}>Compare side by side</Button>
                )}
              </CardBody>
            </Card>
          )}
          {evaluated && s.analysis?.ast && (
            <Card>
              <CardHeader title="Structure" description={s.analysis.ast.method === 'ast' ? 'From the syntax tree' : 'Estimated'} />
              <CardBody className="grid grid-cols-3 gap-2 text-center text-[12.5px]">
                {[['Loops', s.analysis.ast.loops], ['Branches', s.analysis.ast.conditions], ['Functions', s.analysis.ast.functions],
                  ['Max nesting', s.analysis.ast.nesting_depth], ['Complexity', s.analysis.ast.complexity], ['Recursion', s.analysis.ast.has_recursion === undefined ? '—' : s.analysis.ast.has_recursion ? 'Yes' : 'No']].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-2 py-2"><p className="text-ink-3">{k}</p><p className={cn('font-semibold capitalize')}>{v ?? '—'}</p></div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog open={finalizeOpen} onClose={() => setFinalizeOpen(false)} loading={saving} confirmLabel="Finalize grade"
        title="Finalize this grade?" message={`${s.student_name} will see ${score} / ${max} and your comment. Finalized grades can’t be changed.`}
        onConfirm={() => save(true)} />
    </>
  )
}
