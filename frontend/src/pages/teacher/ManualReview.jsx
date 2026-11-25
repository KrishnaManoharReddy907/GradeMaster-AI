import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, FileImage, Lock, Quote, ScanText, Sparkles, RefreshCw } from 'lucide-react'
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, FlagChips, Input, PageHeader, PageSkeleton,
  ScorePill, Spinner, SubmissionStatus, Textarea,
} from '@/components/ui'
import { api, fetchBlobUrl } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDateTime, fmtNum } from '@/lib/utils'

function OriginalPages({ uploads }) {
  const [index, setIndex] = useState(0)
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const file = uploads[index]
  useEffect(() => {
    if (!file) return undefined
    let revoke
    setUrl(null); setError(null)
    fetchBlobUrl(api.teacher.uploadUrl(file.file_id)).then((u) => { revoke = u; setUrl(u) }).catch(setError)
    return () => revoke && URL.revokeObjectURL(revoke)
  }, [file])
  if (!uploads.length) return <EmptyState icon={FileImage} title="No original file" description="This submission predates file storage, or the student typed their answers." className="py-8" />
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12.5px] text-ink-3">
        <span className="truncate">{file.filename}{file.pages > 1 ? ` · ${file.pages} pages` : ''}</span>
        {uploads.length > 1 && (
          <span className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous file" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            {index + 1} / {uploads.length}
            <Button size="icon" variant="ghost" aria-label="Next file" disabled={index === uploads.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </span>
        )}
      </div>
      <div className="grid min-h-64 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
        {error ? <p className="p-6 text-[13px] text-bad">{error.message}</p> : !url ? <Spinner /> : file.content_type === 'application/pdf'
          ? <iframe title="Answer sheet" src={url} className="h-[560px] w-full" />
          : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Answer sheet ${index + 1}`} className="max-h-[560px] w-full object-contain" /></a>}
      </div>
    </div>
  )
}

export default function ManualReview() {
  const { id } = useParams()
  const toast = useToast()
  const sub = useAsync(() => api.teacher.manual(id), [id])
  useDocumentTitle(sub.data ? `${sub.data.student_name} · handwritten review` : 'Handwritten review')
  const [scores, setScores] = useState({})
  const [comments, setComments] = useState({})
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [rescoring, setRescoring] = useState(false)

  useEffect(() => {
    if (!sub.data) return
    setScores(Object.fromEntries(sub.data.results.map((r) => [r.question_id, r.teacher_score ?? r.final_score ?? 0])))
    setComments(Object.fromEntries(sub.data.results.map((r) => [r.question_id, r.teacher_comment || ''])))
    setFeedback(sub.data.teacher_feedback || '')
  }, [sub.data])

  const total = useMemo(() => Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0), [scores])

  if (sub.loading) return <PageSkeleton />
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />
  const s = sub.data
  const finalized = s.status === 'finalized'
  const invalid = s.results.some((r) => scores[r.question_id] === '' || Number(scores[r.question_id]) < 0 || Number(scores[r.question_id]) > r.max_marks)

  const save = async (finalize) => {
    setSaving(true)
    try {
      await api.teacher.reviewManual(id, {
        question_scores: s.results.map((r) => ({ question_id: r.question_id, score: Number(scores[r.question_id]), comment: comments[r.question_id] || null })),
        teacher_feedback: feedback, finalize,
      })
      toast.success(finalize ? 'Grade finalized and released to the student' : 'Review saved')
      setConfirm(false)
      sub.reload()
    } catch (err) { toast.error(err) } finally { setSaving(false) }
  }

  const rescore = async () => {
    setRescoring(true)
    try {
      const res = await api.teacher.reEvaluateManual(id)
      const flags = res.submission?.review_flags || []
      if (flags.includes('ai_unavailable')) toast.warning('AI scoring is still unavailable. Ask your administrator to check “Gemini AI” on the admin overview.')
      else toast.success('Re-scored with AI. Check the suggestions below.')
      sub.reload()
    } catch (err) { toast.error(err) } finally { setRescoring(false) }
  }

  return (
    <>
      <PageHeader title={s.student_name} description={`${s.assessment_title} · submitted ${fmtDateTime(s.submitted_at)}`}
        back={<Link to={`/teacher/assessments/${s.assessment_id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back to assessment</Link>}
        actions={<>{!finalized && <Button variant="secondary" size="sm" icon={RefreshCw} loading={rescoring} onClick={rescore}>Re-run AI scoring</Button>}
          <SubmissionStatus status={s.status} /></>} />
      {s.review_flags?.length > 0 && <div className="mb-4"><FlagChips flags={s.review_flags} max={6} /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Original answer sheet" description={s.ocr?.avg_confidence ? `OCR confidence ${Math.round(s.ocr.avg_confidence * 100)}%` : undefined}
              action={<Badge icon={ScanText}>Source</Badge>} />
            <CardBody><OriginalPages uploads={s.uploads || []} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Overall" />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[12px] text-ink-3">AI suggestion</p><ScorePill score={s.total_score} max={s.total_marks} className="text-lg" /></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[12px] text-ink-3">{finalized ? 'Final' : 'Your total'}</p><ScorePill score={finalized ? s.final_score : total} max={s.total_marks} className="text-lg" /></div>
              </div>
              {finalized ? <Callout tone="good" icon={Lock} title="Finalized">{s.teacher_feedback || 'No overall comment.'}</Callout> : (
                <>
                  <Field label="Overall comment for the student">{({ id: fid }) => <Textarea id={fid} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}</Field>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" loading={saving} disabled={invalid} onClick={() => save(false)}>Save draft</Button>
                    <Button className="flex-1" icon={Lock} disabled={invalid} onClick={() => setConfirm(true)}>Finalize</Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          {s.results.map((r, i) => (
            <Card key={r.question_id}>
              <CardHeader title={`Question ${i + 1}`} description={r.question_text}
                action={<ScorePill score={finalized ? (r.teacher_score ?? r.final_score) : Number(scores[r.question_id])} max={r.max_marks} />} />
              <CardBody className="space-y-4">
                <div>
                  <p className="eyebrow mb-1.5">Student’s answer (as transcribed)</p>
                  <div className="prose-answer rounded-xl bg-surface-2 p-3 text-[13.5px]">{s.student_answers[r.question_id] || Object.entries(s.student_answers).find(([k]) => k.toLowerCase() === r.question_id.toLowerCase())?.[1] || <span className="text-ink-3">No answer</span>}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 text-[12.5px]">
                  <div className="rounded-lg border border-line p-2.5"><p className="text-ink-3">Semantic (AI)</p><p className="font-semibold">{r.ai_score === null || r.ai_score === undefined ? 'Unavailable' : `${fmtNum(r.ai_score)} / ${fmtNum(r.max_marks)}`}</p></div>
                  <div className="rounded-lg border border-line p-2.5"><p className="text-ink-3">Keyword coverage</p><p className="font-semibold">{r.keyword_score === null || r.keyword_score === undefined ? 'No keywords' : `${fmtNum(r.keyword_score)} / ${fmtNum(r.max_marks)}`}</p></div>
                  <div className="rounded-lg border border-line p-2.5"><p className="text-ink-3">AI confidence</p><p className="font-semibold">{r.confidence !== undefined ? `${Math.round(r.confidence * 100)}%` : '—'}</p></div>
                </div>
                {r.criteria?.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Rubric</p>
                    <ul className="space-y-2">{r.criteria.map((c) => (
                      <li key={c.criterion} className="rounded-xl border border-line p-3 text-[13px]">
                        <div className="flex items-center justify-between gap-3"><span className="font-medium">{c.criterion}</span><span className="tabular text-ink-2">{fmtNum(c.awarded)} / {fmtNum(c.marks)}</span></div>
                        {c.evidence && <p className="mt-1.5 flex gap-1.5 text-ink-2"><Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />“{c.evidence}”</p>}
                        {c.comment && <p className="mt-1 text-ink-3">{c.comment}</p>}
                      </li>))}</ul>
                  </div>
                )}
                {(r.keywords_matched?.length > 0 || r.keywords_missed?.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.keywords_matched.map((k) => <Badge key={k} tone="good">✓ {k.split('|')[0]}</Badge>)}
                    {r.keywords_missed.map((k) => <Badge key={k} tone="bad">✗ {k.split('|')[0]}</Badge>)}
                  </div>
                )}
                {r.feedback && <p className="flex gap-2 text-[13px] text-ink-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />{r.feedback}</p>}
                <details className="text-[13px]"><summary className="cursor-pointer text-ink-3">Model answer</summary><p className="prose-answer mt-2 text-ink-2">{r.model_answer}</p></details>
                {!finalized && (
                  <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[140px_1fr]">
                    <Field label={`Score (max ${fmtNum(r.max_marks)})`}>{({ id: fid }) => (
                      <Input id={fid} type="number" step="0.5" min={0} max={r.max_marks} value={scores[r.question_id] ?? ''}
                        invalid={Number(scores[r.question_id]) > r.max_marks} onChange={(e) => setScores({ ...scores, [r.question_id]: e.target.value })} />)}</Field>
                    <Field label="Comment (optional)">{({ id: fid }) => (
                      <Input id={fid} value={comments[r.question_id] || ''} onChange={(e) => setComments({ ...comments, [r.question_id]: e.target.value })} />)}</Field>
                  </div>
                )}
                {finalized && r.teacher_comment && <Callout tone="info">{r.teacher_comment}</Callout>}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={saving} confirmLabel="Finalize grade"
        title="Finalize this grade?" message={`${s.student_name} will see ${fmtNum(total, 2)} / ${fmtNum(s.total_marks)} with your comments. This can’t be changed afterwards.`}
        onConfirm={() => save(true)} />
    </>
  )
}
