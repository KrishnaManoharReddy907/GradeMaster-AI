import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, FileImage, Loader2, RotateCcw, ScanText, Send, Trash2, UploadCloud, Wand2, XCircle,
} from 'lucide-react'
import { Badge, Button, Callout, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, PageSkeleton, Textarea } from '@/components/ui'
import { Logo, ThemeToggle } from '@/components/AppShell'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, usePersistentState } from '@/lib/hooks'
import { useLeaveGuard } from './exam'
import { useToast } from '@/lib/ui-state'
import { cn, fmtDateTime } from '@/lib/utils'

const ACCEPT = '.jpg,.jpeg,.png,.bmp,.tif,.tiff,.webp,.pdf'
const MAX_MB = 20

function Steps({ step }) {
  const steps = ['Upload pages', 'Check answers', 'Submit']
  return (
    <ol className="mb-6 flex items-center gap-2 text-[13px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cn('grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold',
            i < step ? 'bg-good text-white' : i === step ? 'bg-brand text-brand-ink' : 'bg-surface-3 text-ink-3')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
          <span className={i === step ? 'font-medium' : 'text-ink-3'}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
        </li>
      ))}
    </ol>
  )
}

export default function TakeHandwritten() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const data = useAsync(async () => {
    const [assessment, status] = await Promise.all([api.student.assessment(id), api.student.status(id)])
    return { assessment, submitted: status.manual_submitted }
  }, [id])
  useDocumentTitle(data.data?.assessment.title)
  const [files, setFiles, clearFiles] = usePersistentState(`gm-hw-files-${id}`, [])
  const [answers, setAnswers, clearAnswers] = usePersistentState(`gm-hw-answers-${id}`, null)
  const [mapping, setMapping] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)
  useLeaveGuard(files.some((f) => f.status === 'uploading') || submitting)

  const questions = data.data?.assessment.manual_questions || []
  const ready = files.filter((f) => f.status === 'done')
  const step = answers ? 1 : 0

  const upload = async (list) => {
    const chosen = Array.from(list)
    for (const file of chosen) {
      const key = `${file.name}-${file.size}-${Date.now()}`
      if (file.size > MAX_MB * 1024 * 1024) { toast.error(`${file.name} is larger than ${MAX_MB} MB`); continue }
      setFiles((fs) => [...fs, { key, name: file.name, size: file.size, status: 'uploading' }])
      try {
        const r = await api.student.uploadHandwritten(file, id)
        setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'done', upload_id: r.upload_id, text: r.raw_text, pages: r.total_pages,
          confidence: r.avg_confidence, engines: r.engines } : f)))
      } catch (e) {
        setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'error', error: e.message } : f)))
      }
    }
  }

  const extract = async () => {
    setProcessing(true)
    try {
      const raw = ready.map((f) => f.text).join('\n\n')
      const res = await api.student.processHandwritten(raw, id)
      const byId = {}
      questions.forEach((q) => {
        const match = res.answers.find((x) => x.question.toLowerCase() === q.question_id.toLowerCase()
          || x.question.replace(/\D/g, '') === q.question_id.replace(/\D/g, ''))
        byId[q.question_id] = match?.answer || ''
      })
      setAnswers(byId)
      setMapping({ warnings: res.warnings || [], unassigned: res.unassigned_text, method: res.method })
    } catch (e) { toast.error(e) } finally { setProcessing(false) }
  }

  const avgConfidence = ready.filter((f) => f.confidence).length
    ? ready.reduce((a, f) => a + (f.confidence || 0), 0) / ready.filter((f) => f.confidence).length : null

  const submit = async () => {
    setSubmitting(true)
    try {
      await api.student.submitHandwritten({ assessment_id: id, answers, upload_ids: ready.map((f) => f.upload_id),
        ocr: { avg_confidence: avgConfidence, raw_text: ready.map((f) => f.text).join('\n\n') } })
      clearFiles(); clearAnswers()
      toast.success('Your teacher will review the evaluation before results are released.', 'Submitted')
      navigate(`/student/results/${id}`, { replace: true })
    } catch (e) { toast.error(e); setSubmitting(false) }
  }

  if (data.loading) return <div className="p-8"><PageSkeleton /></div>
  if (data.error) return <div className="p-8"><ErrorState error={data.error} onRetry={data.reload} /></div>
  const a = data.data.assessment
  if (data.data.submitted) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-good" />
        <h1 className="mt-3 text-xl font-semibold">Already submitted</h1>
        <p className="mt-1 text-ink-3">You’ve submitted this assignment.</p>
        <Link to={`/student/results/${id}`}><Button className="mt-5">View status</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-15 max-w-5xl items-center gap-3 px-4">
          <Logo />
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link to="/student/assessments" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Assessments</Link>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        <p className="mb-5 mt-1 text-ink-3">{a.total_marks} marks · closes {fmtDateTime(a.end_time)}</p>
        <Steps step={step} />

        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader title="Upload your answer sheets" description="Photos or scans (JPG, PNG, PDF…), up to 20 MB each. Upload every page." />
              <CardBody className="space-y-4">
                <button type="button" onClick={() => input.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }}
                  className={cn('flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                    dragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-surface-2')}>
                  <UploadCloud className="h-8 w-8 text-ink-3" />
                  <p className="mt-2 font-medium">Drop files here or click to choose</p>
                  <p className="text-[12.5px] text-ink-3">Good light, page flat, whole page in frame</p>
                </button>
                <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
                {files.length > 0 && (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {files.map((f) => (
                      <li key={f.key} className="flex items-center gap-3 px-3 py-2.5">
                        <FileImage className="h-5 w-5 shrink-0 text-ink-3" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{f.name}</p>
                          <p className="text-[12px] text-ink-3">
                            {f.status === 'uploading' ? 'Reading handwriting…' : f.status === 'error' ? <span className="text-bad">{f.error}</span>
                              : `${f.pages} page${f.pages === 1 ? '' : 's'}${f.confidence ? ` · ${Math.round(f.confidence * 100)}% legible` : ''}`}
                          </p>
                        </div>
                        {f.status === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin text-ink-3" />
                          : f.status === 'error' ? <XCircle className="h-4 w-4 text-bad" />
                            : f.confidence && f.confidence < 0.7 ? <Badge tone="warn" icon={AlertTriangle}>Hard to read</Badge> : <CheckCircle2 className="h-4 w-4 text-good" />}
                        {f.status !== 'uploading' && <Button size="icon" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}><Trash2 className="h-4 w-4" /></Button>}
                      </li>
                    ))}
                  </ul>
                )}
                {ready.some((f) => f.confidence && f.confidence < 0.7) && (
                  <Callout tone="warn" icon={AlertTriangle}>Some pages were hard to read. Retaking the photo in better light usually helps; you can also correct the text in the next step.</Callout>
                )}
                <Button className="w-full" size="lg" icon={Wand2} loading={processing} disabled={!ready.length || files.some((f) => f.status === 'uploading')} onClick={extract}>
                  Match text to questions</Button>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Questions" />
              <CardBody className="space-y-3">
                {questions.map((q, i) => (
                  <div key={q.question_id} className="rounded-xl bg-surface-2 p-3">
                    <p className="text-[12px] text-ink-3">Q{i + 1} · {q.marks} marks</p>
                    <p className="mt-0.5 text-[13.5px]">{q.question_text}</p>
                  </div>
                ))}
                <p className="text-[12.5px] text-ink-3">Label each answer with its question number (Q1, Q2…) on the paper. It makes matching more reliable.</p>
              </CardBody>
            </Card>
          </div>
        )}

        {step >= 1 && answers && (
          <div className="space-y-4">
            <Callout tone="info" icon={ScanText} title="Check every answer against your paper">
              This is what the handwriting reader understood. Fix misread words and move text to the right question. Don’t add new content: your teacher
              compares this with your original pages.
            </Callout>
            {mapping?.warnings?.map((w) => <Callout key={w} tone="warn" icon={AlertTriangle}>{w}</Callout>)}
            {mapping?.unassigned && <Callout tone="warn" title="Text that couldn’t be matched"><p className="prose-answer">{mapping.unassigned}</p></Callout>}
            {questions.map((q, i) => (
              <Card key={q.question_id}>
                <CardHeader title={`Question ${i + 1}`} description={q.question_text} action={<Badge>{q.marks} marks</Badge>} />
                <CardBody>
                  <Textarea aria-label={`Answer to question ${i + 1}`} rows={Math.min(14, Math.max(4, Math.ceil((answers[q.question_id] || '').length / 90)))}
                    value={answers[q.question_id] || ''} onChange={(e) => setAnswers({ ...answers, [q.question_id]: e.target.value })}
                    placeholder="No text was matched to this question" />
                  {!answers[q.question_id]?.trim() && <p className="mt-1.5 text-[12.5px] text-warn">Empty answers score zero.</p>}
                </CardBody>
              </Card>
            ))}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="secondary" icon={RotateCcw} onClick={() => { setAnswers(null); setMapping(null) }}>Back to uploads</Button>
              <Button size="lg" icon={Send} onClick={() => setConfirm(true)}>Submit for evaluation</Button>
            </div>
          </div>
        )}
      </main>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={submitting} confirmLabel="Submit"
        title="Submit your answers?" onConfirm={submit}
        message={`${questions.filter((q) => answers?.[q.question_id]?.trim()).length} of ${questions.length} questions have an answer. You can submit only once.`} />
    </div>
  )
}
