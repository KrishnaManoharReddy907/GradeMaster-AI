import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Send } from 'lucide-react'
import { Badge, Button, Callout, ConfirmDialog, ErrorState, PageSkeleton, Select } from '@/components/ui'
import { CodeEditor, LANGUAGE_LABEL } from '@/components/code'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, usePersistentState } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn } from '@/lib/utils'
import { enterFullscreen, ExamShell, isProctored, ProctorOverlay, StartGate, useDeadline, useLeaveGuard, useProctoring } from './exam'

const TEMPLATES = {
  python: '# Read input with input() and print the answer.\n\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  javascript: "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\n\n",
}

export default function TakeCoding() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const a = useAsync(async () => {
    const [assessment, status] = await Promise.all([api.student.assessment(id), api.student.status(id)])
    return { assessment, submitted: new Set(status.coding_submissions.map((s) => s.question_id)) }
  }, [id])
  useDocumentTitle(a.data?.assessment.title)
  const [attempt, setAttempt] = useState(null)
  const [starting, setStarting] = useState(false)
  const [drafts, setDrafts, clearDrafts] = usePersistentState(`gm-code-${id}`, {})
  const [current, setCurrent] = useState(0)
  const [submitted, setSubmitted] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const remaining = useDeadline(attempt)

  const assessment = a.data?.assessment
  const questions = assessment?.coding_questions || []
  const allowed = assessment?.coding_config?.allowed_languages || ['python']
  useEffect(() => { if (a.data) { setSubmitted(a.data.submitted); if (a.data.assessment.attempt) setAttempt({ ...a.data.assessment.attempt, resumed: true }) } }, [a.data])
  useLeaveGuard(Boolean(attempt) && submitted.size < questions.length)

  const q = questions[current]
  const draft = (q && drafts[q.question_id]) || { language: allowed[0], code: TEMPLATES[allowed[0]] }
  const setDraft = (patch) => setDrafts((d) => ({ ...d, [q.question_id]: { ...draft, ...patch } }))

  const submitOne = useCallback(async (question, d) => {
    const res = await api.student.submitCode({ assessment_id: id, question_id: question.question_id, code: d.code, language: d.language })
    setSubmitted((s) => new Set([...s, question.question_id]))
    return res
  }, [id])

  const submitCurrent = async () => {
    setBusy(true)
    try {
      await submitOne(q, draft)
      toast.success(`“${q.title}” submitted. It will be evaluated automatically.`)
      setConfirm(null)
      const next = questions.findIndex((qq, i) => i !== current && !submitted.has(qq.question_id))
      if (next >= 0) setCurrent(next)
      else { clearDrafts(); navigate(`/student/results/${id}`, { replace: true }) }
    } catch (e) {
      if (e.status === 409) setSubmitted((s) => new Set([...s, q.question_id]))
      toast.error(e)
    } finally { setBusy(false) }
  }

  // Time up: submit every unsubmitted question that has a draft.
  const autoSubmitAll = useCallback(async (reason = 'time') => {
    setBusy(true)
    for (const qq of questions) {
      const d = drafts[qq.question_id]
      if (!submitted.has(qq.question_id) && d?.code?.trim() && d.code.trim() !== (TEMPLATES[d.language] || '').trim()) {
        try { await submitOne(qq, d) } catch { /* already submitted or window closed */ }
      }
    }
    clearDrafts()
    toast.warning(reason === 'proctor' ? 'Submitted after repeated proctoring violations. Your saved code was submitted.' : 'Time’s up. Your saved code was submitted automatically.')
    navigate(`/student/results/${id}`, { replace: true })
  }, [questions, drafts, submitted, submitOne, clearDrafts, navigate, id, toast])

  useEffect(() => { if (attempt && remaining !== null && remaining <= 0 && !busy) autoSubmitAll() }, [remaining, attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  const proctor = useProctoring({ assessmentId: id, assessment, attempt, onTerminate: () => autoSubmitAll('proctor') })

  const usesStdin = useMemo(() => {
    const c = draft.code || ''
    return /input\(|Scanner|cin|scanf|readFileSync|getline|BufferedReader/.test(c)
  }, [draft.code])

  if (a.loading) return <div className="p-8"><PageSkeleton /></div>
  if (a.error) return <div className="p-8"><ErrorState error={a.error} onRetry={a.reload} /></div>
  if (assessment.assessment_type === 'mixed') return <Navigate to={`/student/take/mixed/${id}`} replace />
  if (!attempt) return <StartGate assessment={assessment} kind="coding" onStart={async () => {
    setStarting(true); if (isProctored(assessment)) enterFullscreen(); try { setAttempt(await api.student.start(id)) } catch (e) { toast.error(e) } finally { setStarting(false) } }} starting={starting} />

  const done = submitted.has(q.question_id)
  return (
    <ExamShell title={assessment.title} subtitle={`${submitted.size} of ${questions.length} submitted`} remaining={remaining}
      submitLabel={submitted.size === questions.length ? 'Finish' : 'Finish'} submitting={false}
      onSubmit={() => (submitted.size === questions.length ? navigate(`/student/results/${id}`) : setConfirm('finish'))} saved="Drafts saved on this device">
      <ProctorOverlay proctor={proctor} remaining={remaining} />
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {questions.length > 1 && (
          <nav className="mb-4 flex gap-2 overflow-x-auto" aria-label="Problems">
            {questions.map((qq, i) => (
              <button key={qq.question_id} onClick={() => setCurrent(i)} aria-current={i === current}
                className={cn('inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] font-medium whitespace-nowrap',
                  i === current ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface hover:bg-surface-2')}>
                {submitted.has(qq.question_id) ? <CheckCircle2 className="h-4 w-4 text-good" /> : <Circle className="h-4 w-4 text-ink-3" />}
                {i + 1}. {qq.title}
              </button>
            ))}
          </nav>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.9fr)_1.1fr]">
          <section className="card h-fit space-y-4 p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{q.title}</h2>
              <Badge>{q.marks} marks</Badge>
            </div>
            <p className="prose-answer text-[14px] text-ink-2">{q.problem_statement}</p>
            {[['Input format', q.input_format], ['Output format', q.output_format], ['Constraints', q.constraints]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><p className="eyebrow mb-1">{k}</p><p className="prose-answer text-[13.5px] text-ink-2">{v}</p></div>
            ))}
            {(q.public_test_cases?.length ? q.public_test_cases : q.sample_input || q.sample_output ? [{ input: q.sample_input, expected_output: q.sample_output }] : []).map((t, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <div><p className="eyebrow mb-1">Example {i + 1} input</p><pre className="code-block">{t.input || '(none)'}</pre></div>
                <div><p className="eyebrow mb-1">Expected output</p><pre className="code-block">{t.expected_output}</pre></div>
              </div>
            ))}
            <p className="text-[12.5px] text-ink-3">Your program is also checked against hidden tests. Time limit {q.time_limit_seconds}s.</p>
          </section>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select aria-label="Language" className="w-44" value={draft.language} disabled={done}
                onChange={(e) => setDraft({ language: e.target.value, code: draft.code.trim() && draft.code !== TEMPLATES[draft.language] ? draft.code : TEMPLATES[e.target.value] })}>
                {allowed.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l] || l}</option>)}
              </Select>
              <Button icon={Send} disabled={done || !draft.code.trim()} onClick={() => setConfirm('one')}>{done ? 'Submitted' : 'Submit this problem'}</Button>
            </div>
            {done && <Callout tone="good" icon={CheckCircle2}>Submitted. You can’t change it now; it’s being evaluated in the background.</Callout>}
            {!done && !usesStdin && draft.code.length > 40 && (
              <Callout tone="warn">Your program doesn’t seem to read input. Tests feed data on standard input and compare what you print.</Callout>
            )}
            <CodeEditor value={draft.code} onChange={(code) => setDraft({ code })} language={draft.language} readOnly={done} height="calc(100vh - 15rem)" />
          </section>
        </div>
      </div>
      <ConfirmDialog open={confirm === 'one'} onClose={() => setConfirm(null)} loading={busy} confirmLabel="Submit"
        title={`Submit “${q.title}”?`} message="Each problem can be submitted once. Make sure your program reads from standard input and prints exactly the expected output."
        onConfirm={submitCurrent} />
      <ConfirmDialog open={confirm === 'finish'} onClose={() => setConfirm(null)} confirmLabel="Leave without submitting the rest"
        title="Some problems aren’t submitted" danger
        message={`${questions.length - submitted.size} problem(s) haven’t been submitted. Unsubmitted problems score zero. Your drafts stay on this device until the deadline.`}
        onConfirm={() => navigate(`/student/results/${id}`)} />
    </ExamShell>
  )
}
