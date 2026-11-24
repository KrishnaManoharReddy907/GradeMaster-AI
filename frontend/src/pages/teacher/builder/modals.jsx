import { useEffect, useState } from 'react'
import { LibraryBig, Search, Sparkles, TriangleAlert } from 'lucide-react'
import { Badge, Button, Callout, Checkbox, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, TypeBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { optionLabel } from '@/lib/utils'
import { uid } from './editors'

const questionTitle = (q) => q.question_text || q.title || 'Untitled question'

export function BankPicker({ open, onClose, subjectId, allowedTypes, onPick }) {
  const [type, setType] = useState(allowedTypes[0])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState({})
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t) }, [search])
  useEffect(() => { if (open) { setSelected({}); setType(allowedTypes[0]) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const bank = useAsync(() => (open ? api.teacher.bank({ subject_id: subjectId, type, search: debounced, limit: 50 }) : Promise.resolve(null)),
    [open, subjectId, type, debounced])
  const items = bank.data?.items || []
  const chosen = Object.values(selected)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add from question bank" description="Your saved questions plus questions colleagues shared for this subject."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!chosen.length} onClick={() => { onPick(chosen); onClose() }}>Add {chosen.length || ''} question{chosen.length === 1 ? '' : 's'}</Button></>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {allowedTypes.length > 1 && (
          <Select aria-label="Question type" value={type} onChange={(e) => setType(e.target.value)} className="w-40">
            {allowedTypes.map((t) => <option key={t} value={t}>{{ mcq: 'MCQ', coding: 'Coding', manual: 'Descriptive' }[t]}</option>)}
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Search bank" placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>
      {bank.error ? <ErrorState error={bank.error} onRetry={bank.reload} /> : bank.loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !items.length ? (
        <EmptyState icon={LibraryBig} title="No saved questions" description="Save questions from the builder or the Question bank page to reuse them here." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 px-3 py-3">
              <Checkbox checked={Boolean(selected[it.id])} label={<span className="sr-only">Select</span>}
                onChange={(c) => setSelected((s) => { const n = { ...s }; if (c) n[it.id] = it; else delete n[it.id]; return n })} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium">{questionTitle(it.question)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <TypeBadge type={it.type} />
                  {it.topic && <Badge>{it.topic}</Badge>}
                  <Badge>{it.question.marks} mark{it.question.marks === 1 ? '' : 's'}</Badge>
                  {it.source === 'ai' && <Badge tone="brand" icon={Sparkles}>AI draft</Badge>}
                  {it.usage_count > 0 && <span className="text-[12px] text-ink-3">used {it.usage_count}×</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export function AiGenerateModal({ open, onClose, subjectId, topics, allowedTypes, onAccept }) {
  const toast = useToast()
  const [form, setForm] = useState({ type: allowedTypes[0], topic: '', difficulty: 'medium', count: 5, marks: allowedTypes[0] === 'mcq' ? 1 : 5, context: '' })
  const [drafts, setDrafts] = useState(null)
  const [keep, setKeep] = useState({})
  const [pending, setPending] = useState(false)
  useEffect(() => { if (open) { setDrafts(null); setKeep({}) } }, [open])

  const generate = async (e) => {
    e.preventDefault()
    setPending(true)
    try {
      const res = await api.teacher.generate({ subject_id: subjectId, ...form, count: Number(form.count), marks: Number(form.marks), context: form.context || null })
      setDrafts(res.drafts)
      setKeep(Object.fromEntries(res.drafts.map((_, i) => [i, true])))
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }

  const accept = () => {
    onAccept(form.type, drafts.filter((_, i) => keep[i]).map((d) => ({ ...d, _key: uid(), _source: 'ai' })))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Draft questions with AI"
      description="Drafts are a starting point. Check every fact and answer key before publishing."
      footer={drafts ? <>
        <Button variant="secondary" onClick={() => setDrafts(null)}>Back</Button>
        <Button disabled={!Object.values(keep).some(Boolean)} onClick={accept}>Add selected</Button></>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="ai-form" type="submit" icon={Sparkles} loading={pending} disabled={!form.topic.trim()}>Generate</Button></>}>
      {!drafts ? (
        <form id="ai-form" onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
          {allowedTypes.length > 1 && (
            <Field label="Question type">{({ id }) => (
              <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, marks: e.target.value === 'mcq' ? 1 : 5 })}>
                {allowedTypes.map((t) => <option key={t} value={t}>{t === 'mcq' ? 'Multiple choice' : 'Descriptive'}</option>)}
              </Select>)}</Field>
          )}
          <Field label="Topic" className={allowedTypes.length > 1 ? '' : 'sm:col-span-2'}>{({ id }) => (
            <>
              <Input id={id} list="ai-topics" required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Binary search trees" />
              <datalist id="ai-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
            </>)}</Field>
          <Field label="Difficulty">{({ id }) => (
            <Select id={id} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </Select>)}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many">{({ id }) => <Input id={id} type="number" min={1} max={10} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />}</Field>
            <Field label="Marks each">{({ id }) => <Input id={id} type="number" min={1} max={20} value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />}</Field>
          </div>
          <Field label="Syllabus notes" className="sm:col-span-2" hint="Optional. Paste lecture notes or learning outcomes to keep questions on-syllabus.">
            {({ id }) => <Textarea id={id} rows={4} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />}
          </Field>
        </form>
      ) : (
        <div className="space-y-3">
          <Callout tone="warn" icon={TriangleAlert}>AI can be confidently wrong. Uncheck anything you wouldn’t put in front of students.</Callout>
          {drafts.map((d, i) => (
            <label key={i} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={Boolean(keep[i])} onChange={(e) => setKeep({ ...keep, [i]: e.target.checked })} />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-medium">{d.question_text}</p>
                {d.options && (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {d.options.map((o, oi) => (
                      <li key={o.option_id} className={o.option_id === d.correct_option_id ? 'font-medium text-good' : 'text-ink-2'}>
                        {optionLabel(oi)}. {o.text}{o.option_id === d.correct_option_id && ' ✓'}</li>
                    ))}
                  </ul>
                )}
                {d.model_answer && <p className="mt-2 text-ink-2"><span className="font-medium text-ink">Model answer:</span> {d.model_answer}</p>}
                {d.rubric?.length > 0 && <p className="mt-1 text-ink-3">Rubric: {d.rubric.map((c) => `${c.criterion} (${c.marks})`).join(' · ')}</p>}
                {d.explanation && <p className="mt-1 text-ink-3">{d.explanation}</p>}
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}
