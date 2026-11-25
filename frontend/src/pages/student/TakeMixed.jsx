/**
 * One exam for a mixed assessment: Part A (MCQ) and Part B (coding) share a single timer
 * and are submitted together with one "Submit assessment" action (or automatically at time-out).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Code2, ListChecks } from 'lucide-react'
import { Badge, Button, Callout, ConfirmDialog, ErrorState, PageSkeleton, Select } from '@/components/ui'
import { CodeEditor, LANGUAGE_LABEL } from '@/components/code'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, usePersistentState } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn, optionLabel } from '@/lib/utils'
import { enterFullscreen, ExamShell, isProctored, ProctorOverlay, StartGate, useDeadline, useLeaveGuard, useProctoring, useSubmittingRef } from './exam'

const TEMPLATES = {
  python: '# Read input with input() and print the answer.\n\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
  javascript: "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\n\n",
}
const isBlank = (d) => !d?.code?.trim() || d.code.trim() === (TEMPLATES[d.language] || '').trim()

export default function TakeMixed() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const a = useAsync(async () => {
    const [assessment, status] = await Promise.all([api.student.assessment(id), api.student.status(id)])
    return { assessment, mcqDone: Boolean(status.mcq_submitted), codingDone: new Set(status.coding_submissions.map((s) => s.question_id)) }
  }, [id])
  const assessment = a.data?.assessment
  useDocumentTitle(assessment?.title)
  const [attempt, setAttempt] = useState(null)
  const [starting, setStarting] = useState(false)
  const [answers, setAnswers, clearAnswers] = usePersistentState(`gm-mixed-mcq-${id}`, {})
  const [drafts, setDrafts, clearDrafts] = usePersistentState(`gm-mixed-code-${id}`, {})
  const [view, setView] = useState('mcq')
  const [confirm, setConfirm] = useState(false)
  const { submitting, begin, end } = useSubmittingRef()
  const remaining = useDeadline(attempt)

  const mcq = assessment?.mcq_questions || []
  const coding = assessment?.coding_questions || []
  const allowed = assessment?.coding_config?.allowed_languages || ['python']
  const mcqDone = a.data?.mcqDone
  const codingDone = a.data?.codingDone || new Set()
  useEffect(() => { if (a.data?.assessment.attempt) setAttempt({ ...a.data.assessment.attempt, resumed: true }) }, [a.data])
  useEffect(() => { if (a.data && !mcq.length && coding.length) setView(coding[0].question_id) }, [a.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useLeaveGuard(Boolean(attempt))

  const answered = mcq.filter((q) => answers[q.question_id]).length
  const written = coding.filter((q) => codingDone.has(q.question_id) || !isBlank(drafts[q.question_id])).length
  const q = coding.find((x) => x.question_id === view)
  const draft = (q && drafts[q.question_id]) || { language: allowed[0], code: TEMPLATES[allowed[0]] }
  const setDraft = (patch) => setDrafts((d) => ({ ...d, [q.question_id]: { ...draft, ...patch } }))

  const submitAll = useCallback(async (auto = false) => {
    if (!begin()) return
    const problems = []
    try {
      if (mcq.length && !mcqDone) {
        const payload = mcq.filter((qq) => answers[qq.question_id]).map((qq) => ({ question_id: qq.question_id, selected_option_id: answers[qq.question_id] }))
        try { await api.student.submitMcq(id, payload) } catch (e) { if (e.status !== 409) problems.push(`MCQ: ${e.message}`) }
      }
      for (const qq of coding) {
        const d = drafts[qq.question_id]
        if (codingDone.has(qq.question_id) || isBlank(d)) continue
        try { await api.student.submitCode({ assessment_id: id, question_id: qq.question_id, code: d.code, language: d.language }) }
        catch (e) { if (e.status !== 409) problems.push(`${qq.title}: ${e.message}`) }
      }
      if (problems.length) { toast.error(problems.join(' · ')); end(); return }
      clearAnswers(); clearDrafts()
      toast.success('Coding answers are evaluated automatically; your teacher finalises the grade.',
        auto === 'proctor' ? 'Submitted after repeated proctoring violations' : auto ? 'Time’s up: submitted automatically' : 'Assessment submitted')
      navigate(`/student/results/${id}`, { replace: true })
    } catch (e) { toast.error(e); end() }
  }, [begin, end, mcq, coding, mcqDone, codingDone, answers, drafts, id, clearAnswers, clearDrafts, navigate, toast])

  useEffect(() => { if (attempt && remaining !== null && remaining <= 0) submitAll(true) }, [remaining, attempt, submitAll])
  const proctor = useProctoring({ assessmentId: id, assessment, attempt, onTerminate: () => submitAll('proctor') })

  const nav = useMemo(() => [
    ...(mcq.length ? [{ key: 'mcq', label: `Part A · Multiple choice`, sub: `${mcqDone ? mcq.length : answered}/${mcq.length}`, done: mcqDone || answered === mcq.length, icon: ListChecks }] : []),
    ...coding.map((qq, i) => ({ key: qq.question_id, label: `Part B · ${i + 1}. ${qq.title}`, sub: `${qq.marks} marks`,
      done: codingDone.has(qq.question_id) || !isBlank(drafts[qq.question_id]), icon: Code2 })),
  ], [mcq, coding, mcqDone, answered, codingDone, drafts])

  if (a.loading) return <div className="p-8"><PageSkeleton /></div>
  if (a.error) return <div className="p-8"><ErrorState error={a.error} onRetry={a.reload} /></div>
  if (!attempt) return <StartGate assessment={assessment} kind="mixed" starting={starting} onStart={async () => {
    setStarting(true); if (isProctored(assessment)) enterFullscreen(); try { setAttempt(await api.student.start(id)) } catch (e) { toast.error(e) } finally { setStarting(false) } }} />

  const keyIdx = nav.findIndex((n) => n.key === view)
  const goNext = () => keyIdx < nav.length - 1 && setView(nav[keyIdx + 1].key)
  const unanswered = (mcqDone ? 0 : mcq.length - answered) + (coding.length - written)

  return (
    <ExamShell title={assessment.title} subtitle={`${mcq.length ? `MCQ ${mcqDone ? mcq.length : answered}/${mcq.length} · ` : ''}Coding ${written}/${coding.length}`}
      remaining={remaining} submitLabel="Submit assessment" onSubmit={() => setConfirm(true)} submitting={submitting} saved="Saved on this device">
      <ProctorOverlay proctor={proctor} remaining={remaining} />
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Sections">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} aria-current={n.key === view}
              className={cn('inline-flex shrink-0 items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] font-medium',
                n.key === view ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface hover:bg-surface-2')}>
              {n.done ? <CheckCircle2 className="h-4 w-4 text-good" /> : <Circle className="h-4 w-4 text-ink-3" />}
              {n.label}<span className="tabular text-[12px] text-ink-3">{n.sub}</span>
            </button>
          ))}
        </nav>

        {view === 'mcq' && (
          <section className="card space-y-6 p-5 sm:p-7" aria-label="Multiple choice">
            {mcqDone && <Callout tone="good" icon={CheckCircle2}>This part is already submitted.</Callout>}
            {mcq.map((qq, qi) => (
              <div key={qq.question_id} className={cn(qi > 0 && 'border-t border-line pt-6')}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-medium leading-relaxed"><span className="text-ink-3">{qi + 1}.</span> {qq.question_text}</h2>
                  <Badge>{qq.marks} mark{qq.marks === 1 ? '' : 's'}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Question ${qi + 1} options`}>
                  {qq.options.map((o, oi) => {
                    const selected = answers[qq.question_id] === o.option_id
                    return (
                      <button key={o.option_id} role="radio" aria-checked={selected} disabled={mcqDone}
                        onClick={() => setAnswers({ ...answers, [qq.question_id]: o.option_id })}
                        className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60',
                          selected ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[12.5px] font-semibold',
                          selected ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong text-ink-3')}>{optionLabel(oi)}</span>
                        <span className="pt-0.5">{o.text}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {coding.length > 0 && <div className="flex justify-end border-t border-line pt-4"><Button onClick={goNext}>Continue to coding</Button></div>}
          </section>
        )}

        {q && (
          <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.9fr)_1.1fr]">
            <section className="card h-fit space-y-4 p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
              <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{q.title}</h2><Badge>{q.marks} marks</Badge></div>
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
              <p className="text-[12.5px] text-ink-3">Also checked against hidden tests. Time limit {q.time_limit_seconds}s.</p>
            </section>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select aria-label="Language" className="w-44" value={draft.language} disabled={codingDone.has(q.question_id)}
                  onChange={(e) => setDraft({ language: e.target.value, code: isBlank(draft) ? TEMPLATES[e.target.value] : draft.code })}>
                  {allowed.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l] || l}</option>)}
                </Select>
                {keyIdx < nav.length - 1
                  ? <Button variant="secondary" onClick={goNext}>Next part</Button>
                  : <Button onClick={() => setConfirm(true)}>Review & submit</Button>}
              </div>
              {codingDone.has(q.question_id) && <Callout tone="good" icon={CheckCircle2}>This problem is already submitted.</Callout>}
              <CodeEditor value={draft.code} onChange={(code) => setDraft({ code })} language={draft.language}
                readOnly={codingDone.has(q.question_id)} height="calc(100vh - 17rem)" />
            </section>
          </div>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={submitting} confirmLabel="Submit assessment"
        title="Submit the whole assessment?" onConfirm={() => submitAll(false)}
        message={unanswered > 0
          ? `${unanswered} item(s) are still empty and will score zero. MCQ answers and code are submitted together and can’t be changed afterwards.`
          : 'MCQ answers and code are submitted together and can’t be changed afterwards.'} />
    </ExamShell>
  )
}
