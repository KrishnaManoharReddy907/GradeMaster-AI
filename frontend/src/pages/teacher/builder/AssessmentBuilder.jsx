import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookmarkPlus, Code2, LibraryBig, ListChecks, PenLine, Plus, RotateCcw, Send, Sparkles } from 'lucide-react'
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, ErrorState, Field, Input, PageHeader, PageSkeleton, Select, Textarea, Toggle,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle, usePersistentState } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn } from '@/lib/utils'
import { blankCoding, blankManual, blankMcq, CodingEditor, ManualEditor, McqEditor, questionIssues, uid } from './editors'
import { AiGenerateModal, BankPicker } from './modals'

const TYPES = [
  { value: 'mcq', label: 'Multiple choice', icon: ListChecks, text: 'Timed, auto-graded instantly' },
  { value: 'coding', label: 'Coding', icon: Code2, text: 'Sandboxed tests + AI feedback' },
  { value: 'manual', label: 'Handwritten', icon: PenLine, text: 'Upload, OCR, rubric scoring' },
  { value: 'mixed', label: 'Mixed', icon: Plus, text: 'MCQ and coding together' },
]
const LANGS = [['python', 'Python'], ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'], ['javascript', 'JavaScript']]

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function freshDraft() {
  const start = new Date(Date.now() + 60 * 60 * 1000); start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return {
    title: '', description: '', assessment_type: 'mcq', subject_id: '', section_ids: [], duration_minutes: 30,
    start: toLocalInput(start), end: toLocalInput(end), instructions: '', release_questions_after_deadline: true,
    rules: { show_result_immediately: false, allow_back_navigation: true, shuffle_questions: false, shuffle_options: false, proctoring_enabled: false, max_violations: 3 },
    coding_config: { allowed_languages: ['python', 'java', 'cpp', 'c'], partial_marking: true, enable_auto_grading: true },
    mcq: [], coding: [], manual: [],
  }
}

const strip = ({ _key, _source, _bankId, ...q }) => q // eslint-disable-line no-unused-vars

export default function AssessmentBuilder() {
  useDocumentTitle('New assessment')
  const toast = useToast()
  const navigate = useNavigate()
  const assignments = useAsync(() => api.teacher.myAssignments(), [])
  const [draft, setDraft, clearDraft] = usePersistentState('gm-builder-draft', freshDraft())
  const [bankOpen, setBankOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [tried, setTried] = useState(false)

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const type = draft.assessment_type
  const kinds = type === 'mixed' ? ['mcq', 'coding'] : [type]
  const a = assignments.data
  const subject = a?.subjects.find((s) => s.id === draft.subject_id)
  const sections = (a?.sections || []).filter((s) => (a?.subject_section_map[draft.subject_id] || []).includes(s.id))
  const topics = subject?.topics || []

  const lists = { mcq: draft.mcq, coding: draft.coding, manual: draft.manual }
  const setList = (kind, fn) => setDraft((d) => ({ ...d, [kind]: fn(d[kind]) }))
  const totalMarks = kinds.reduce((sum, k) => sum + lists[k].reduce((s, q) => s + (Number(q.marks) || 0), 0), 0)
  const questionCount = kinds.reduce((n, k) => n + lists[k].length, 0)

  const problems = useMemo(() => {
    const p = []
    if (!draft.title.trim()) p.push('Add a title')
    if (!draft.subject_id) p.push('Choose a subject')
    if (!draft.section_ids.length) p.push('Choose at least one section')
    const start = new Date(draft.start), end = new Date(draft.end)
    if (type !== 'manual' && start < new Date()) p.push('Start time must be in the future')
    if (end <= start) p.push('End time must be after the start time')
    if (type !== 'manual') {
      if (!(Number(draft.duration_minutes) >= 1)) p.push('Set a duration')
      else if (Number(draft.duration_minutes) > (end - start) / 60000) p.push('Duration is longer than the time window')
    }
    if (!questionCount) p.push('Add at least one question')
    kinds.forEach((k) => lists[k].forEach((q, i) => { if (questionIssues(k, q).length) p.push(`${{ mcq: 'MCQ', coding: 'Coding', manual: 'Question' }[k]} ${i + 1} is incomplete`) }))
    if (type === 'mixed' && !draft.mcq.length && !draft.coding.length) p.push('Add MCQ or coding questions')
    if (draft.coding.length && kinds.includes('coding') && !draft.coding_config.allowed_languages.length) p.push('Allow at least one language')
    return p
  }, [draft, type, questionCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const addQuestion = (kind) => setList(kind, (l) => [...l, { mcq: blankMcq, coding: blankCoding, manual: blankManual }[kind]()])
  const frameProps = (kind, i) => ({
    index: i, total: lists[kind].length, topics,
    onRemove: () => setList(kind, (l) => l.filter((_, j) => j !== i)),
    onMove: (dir) => setList(kind, (l) => { const n = [...l]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n }),
    onDuplicate: () => setList(kind, (l) => [...l.slice(0, i + 1), { ...structuredClone(l[i]), _key: uid() }, ...l.slice(i + 1)]),
  })
  const updater = (kind, i) => (patch) => setList(kind, (l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  const fromBank = (items) => {
    items.forEach((it) => setList(it.type, (l) => [...l, { ...structuredClone(it.question), topic: it.question.topic || '', _key: uid(), _bankId: it.id,
      ...(it.type === 'mcq' ? { explanation: it.question.explanation || '' } : {}), ...(it.type === 'manual' ? { rubric: it.question.rubric || [] } : {}) }]))
    toast.success(`${items.length} question${items.length === 1 ? '' : 's'} added from the bank`)
  }

  const saveToBank = async () => {
    const all = kinds.flatMap((k) => lists[k].filter((q) => !questionIssues(k, q).length && !q._bankId).map((q) => ({ k, q })))
    if (!all.length) { toast.info('No complete, unsaved questions to save'); return }
    let saved = 0
    for (const { k, q } of all) {
      try { await api.teacher.addToBank({ subject_id: draft.subject_id, type: k, question: { ...strip(q), question_id: 'bank' } }); saved += 1 } catch { /* skip invalid */ }
    }
    toast.success(`${saved} question${saved === 1 ? '' : 's'} saved to your bank`)
  }

  const publish = async () => {
    setTried(true)
    if (problems.length) { toast.warning('Fix the highlighted items before publishing'); return }
    setPending(true)
    const ids = { mcq: 'q', coding: 'c', manual: 'Q' }
    const build = (k) => (kinds.includes(k) ? lists[k].map((q, i) => {
      const clean = strip(q)
      if (k === 'mcq') clean.options = clean.options.filter((o) => o.text.trim())
      if (!clean.topic) delete clean.topic
      return { ...clean, question_id: `${ids[k]}${i + 1}` }
    }) : [])
    const body = {
      title: draft.title.trim(), description: draft.description || null, subject_id: draft.subject_id, section_ids: draft.section_ids,
      assessment_type: type, duration_minutes: type === 'manual' ? null : Number(draft.duration_minutes),
      start_time: new Date(draft.start).toISOString(), end_time: new Date(draft.end).toISOString(),
      mcq_questions: build('mcq'), coding_questions: build('coding'), manual_questions: build('manual'),
      coding_config: kinds.includes('coding') ? draft.coding_config : null,
      rules: { ...draft.rules }, instructions: draft.instructions || null,
      release_questions_after_deadline: draft.release_questions_after_deadline,
    }
    try {
      const created = await api.teacher.createAssessment(body)
      const bankIds = kinds.flatMap((k) => lists[k].map((q) => q._bankId).filter(Boolean))
      if (bankIds.length) api.teacher.markBankUsed(bankIds).catch(() => {})
      clearDraft()
      toast.success('Students in the selected sections will see it when it opens.', 'Assessment published')
      navigate(`/teacher/assessments/${created.id}`)
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }

  if (assignments.loading) return <PageSkeleton />
  if (assignments.error) return <ErrorState error={assignments.error} onRetry={assignments.reload} />
  if (!a.subjects.length) {
    return (
      <>
        <PageHeader title="New assessment" />
        <Callout tone="warn" title="You don’t have any teaching assignments yet">
          An administrator needs to assign you to a subject and its sections before you can create assessments.
        </Callout>
      </>
    )
  }

  return (
    <>
      <PageHeader title="New assessment" description="Your draft is saved in this browser as you work."
        back={<Link to="/teacher/assessments" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Assessments</Link>}
        actions={<Button variant="ghost" icon={RotateCcw} onClick={() => setResetOpen(true)}>Start over</Button>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Type" />
            <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => set({ assessment_type: t.value })} aria-pressed={type === t.value}
                  className={cn('rounded-xl border p-3 text-left transition-colors', type === t.value ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                  <t.icon className={cn('h-5 w-5', type === t.value ? 'text-brand' : 'text-ink-3')} />
                  <p className="mt-2 font-medium">{t.label}</p><p className="text-[12.5px] text-ink-3">{t.text}</p>
                </button>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Details & audience" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2" error={tried && !draft.title.trim() ? 'Required' : null}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Unit 2 quiz: Stacks and queues" />}
              </Field>
              <Field label="Description" className="sm:col-span-2">{({ id }) => <Textarea id={id} rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
              <Field label="Subject" error={tried && !draft.subject_id ? 'Required' : null}>{({ id, invalid }) => (
                <Select id={id} invalid={invalid} value={draft.subject_id} onChange={(e) => set({ subject_id: e.target.value, section_ids: [] })}>
                  <option value="">Select a subject</option>{a.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · Year {s.year}</option>)}
                </Select>)}</Field>
              <div>
                <p className="label mb-1.5">Sections</p>
                {!draft.subject_id ? <p className="text-[13px] text-ink-3">Choose a subject first.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {sections.map((s) => (
                      <Checkbox key={s.id} label={`Section ${s.name}`} checked={draft.section_ids.includes(s.id)} className="rounded-lg border border-line px-3 py-1.5"
                        onChange={(c) => set({ section_ids: c ? [...draft.section_ids, s.id] : draft.section_ids.filter((x) => x !== s.id) })} />
                    ))}
                  </div>
                )}
              </div>
              <Field label={type === 'manual' ? 'Opens' : 'Opens'} hint={type === 'manual' ? 'Handwritten assignments may open immediately.' : undefined}>
                {({ id }) => <Input id={id} type="datetime-local" value={draft.start} onChange={(e) => set({ start: e.target.value })} />}</Field>
              <Field label="Closes">{({ id }) => <Input id={id} type="datetime-local" value={draft.end} onChange={(e) => set({ end: e.target.value })} />}</Field>
              {type !== 'manual' && (
                <Field label="Time per student (minutes)" hint="Each student’s clock starts when they open the assessment.">
                  {({ id }) => <Input id={id} type="number" min={1} max={600} value={draft.duration_minutes} onChange={(e) => set({ duration_minutes: e.target.value })} />}</Field>
              )}
              <Field label="Instructions" className="sm:col-span-2">{({ id }) => <Textarea id={id} rows={2} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="Shown before students start" />}</Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Questions" description={subject ? `${questionCount} question${questionCount === 1 ? '' : 's'} · ${totalMarks} marks` : 'Choose a subject to use the bank and AI drafts'}
              action={<>
                <Button size="sm" variant="secondary" icon={LibraryBig} disabled={!draft.subject_id} onClick={() => setBankOpen(true)}>From bank</Button>
                {kinds.some((k) => k !== 'coding') && <Button size="sm" variant="soft" icon={Sparkles} disabled={!draft.subject_id} onClick={() => setAiOpen(true)}>Draft with AI</Button>}
              </>} />
            <CardBody className="space-y-6">
              {kinds.map((k) => (
                <div key={k} className="space-y-3">
                  {kinds.length > 1 && <p className="eyebrow">{k === 'mcq' ? 'Multiple choice' : 'Coding'}</p>}
                  {lists[k].map((q, i) => {
                    const Editor = { mcq: McqEditor, coding: CodingEditor, manual: ManualEditor }[k]
                    return <Editor key={q._key} q={q} set={updater(k, i)} {...frameProps(k, i)} />
                  })}
                  <Button variant="secondary" icon={Plus} onClick={() => addQuestion(k)}>
                    Add {k === 'mcq' ? 'MCQ' : k === 'coding' ? 'coding problem' : 'question'}</Button>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="4. Settings" />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              {kinds.includes('mcq') && <>
                <Toggle checked={draft.rules.show_result_immediately} onChange={(v) => set({ rules: { ...draft.rules, show_result_immediately: v } })}
                  label="Show MCQ results immediately" description="Off: students see scores and answers after the assessment closes." />
                <Toggle checked={draft.rules.allow_back_navigation} onChange={(v) => set({ rules: { ...draft.rules, allow_back_navigation: v } })}
                  label="Allow going back to earlier questions" />
                <Toggle checked={draft.rules.shuffle_questions} onChange={(v) => set({ rules: { ...draft.rules, shuffle_questions: v } })}
                  label="Shuffle question order" description="Each student gets their own order (stable if they reload)." />
                <Toggle checked={draft.rules.shuffle_options} onChange={(v) => set({ rules: { ...draft.rules, shuffle_options: v } })}
                  label="Shuffle answer options" description="Options appear in a different order for each student." />
              </>}
              {(kinds.includes('mcq') || kinds.includes('coding')) && (
                <div className="space-y-2">
                  <Toggle checked={Boolean(draft.rules.proctoring_enabled)} onChange={(v) => set({ rules: { ...draft.rules, proctoring_enabled: v } })}
                    label="Proctored exam" description="Fullscreen required; leaving it, switching tabs or reloading counts as a violation." />
                  {draft.rules.proctoring_enabled && (
                    <label className="ml-12 flex items-center gap-2 text-[13px] text-ink-2">Auto-submit after
                      <select className="rounded-lg border border-line bg-surface px-2 py-1" value={draft.rules.max_violations || 3}
                        onChange={(e) => set({ rules: { ...draft.rules, max_violations: Number(e.target.value) } })}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>violation(s)</label>
                  )}
                </div>
              )}
              <Toggle checked={draft.release_questions_after_deadline} onChange={(v) => set({ release_questions_after_deadline: v })}
                label="Release the question paper after closing" description="Students can revise from it (MCQ answers included)." />
              {kinds.includes('coding') && <>
                <Toggle checked={draft.coding_config.partial_marking} onChange={(v) => set({ coding_config: { ...draft.coding_config, partial_marking: v } })}
                  label="Partial marks for coding" description="Marks in proportion to passed tests; off means all-or-nothing." />
                <Toggle checked={draft.coding_config.enable_auto_grading} onChange={(v) => set({ coding_config: { ...draft.coding_config, enable_auto_grading: v } })}
                  label="Evaluate code automatically on submit" description="Off: you start evaluation from the submissions list." />
                <div className="sm:col-span-2">
                  <p className="label mb-2">Allowed languages</p>
                  <div className="flex flex-wrap gap-2">
                    {LANGS.map(([v, l]) => (
                      <Checkbox key={v} label={l} className="rounded-lg border border-line px-3 py-1.5" checked={draft.coding_config.allowed_languages.includes(v)}
                        onChange={(c) => set({ coding_config: { ...draft.coding_config, allowed_languages: c ? [...draft.coding_config.allowed_languages, v] : draft.coding_config.allowed_languages.filter((x) => x !== v) } })} />
                    ))}
                  </div>
                </div>
              </>}
            </CardBody>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-surface-2 py-3"><dt className="text-[12px] text-ink-3">Questions</dt><dd className="text-xl font-semibold">{questionCount}</dd></div>
                <div className="rounded-xl bg-surface-2 py-3"><dt className="text-[12px] text-ink-3">Total marks</dt><dd className="text-xl font-semibold">{totalMarks}</dd></div>
              </dl>
              {problems.length ? (
                <div>
                  <p className="mb-2 text-[13px] font-medium">Before publishing</p>
                  <ul className="space-y-1.5 text-[13px] text-ink-2">
                    {problems.slice(0, 8).map((p) => <li key={p} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{p}</li>)}
                    {problems.length > 8 && <li className="text-ink-3">…and {problems.length - 8} more</li>}
                  </ul>
                </div>
              ) : <Badge tone="good">Ready to publish</Badge>}
              <Button className="w-full" icon={Send} loading={pending} onClick={publish}>Publish assessment</Button>
              <Button className="w-full" variant="secondary" icon={BookmarkPlus} disabled={!draft.subject_id || !questionCount} onClick={saveToBank}>Save questions to bank</Button>
            </CardBody>
          </Card>
        </aside>
      </div>

      {draft.subject_id && <>
        <BankPicker open={bankOpen} onClose={() => setBankOpen(false)} subjectId={draft.subject_id} allowedTypes={kinds} onPick={fromBank} />
        <AiGenerateModal open={aiOpen} onClose={() => setAiOpen(false)} subjectId={draft.subject_id} topics={topics}
          allowedTypes={kinds.filter((k) => k !== 'coding')} onAccept={(k, qs) => { setList(k, (l) => [...l, ...qs]); toast.success(`${qs.length} draft${qs.length === 1 ? '' : 's'} added. Review before publishing.`) }} />
      </>}
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} danger confirmLabel="Discard draft" title="Start over?"
        message="This clears the current draft, including all questions." onConfirm={() => { setDraft(freshDraft()); setResetOpen(false); setTried(false) }} />
    </>
  )
}
