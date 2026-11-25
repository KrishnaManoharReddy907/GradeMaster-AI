import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Select, Textarea, Toggle } from '@/components/ui'
import { cn } from '@/lib/utils'

export const uid = () => Math.random().toString(36).slice(2, 9)

export const blankMcq = () => ({ _key: uid(), question_text: '', options: [{ option_id: 'a', text: '' }, { option_id: 'b', text: '' },
  { option_id: 'c', text: '' }, { option_id: 'd', text: '' }], correct_option_id: '', marks: 1, difficulty: 'medium', topic: '', explanation: '' })
export const blankCoding = () => ({ _key: uid(), title: '', problem_statement: '', input_format: '', output_format: '', constraints: '',
  sample_input: '', sample_output: '', test_cases: [{ input: '', expected_output: '', is_hidden: false }, { input: '', expected_output: '', is_hidden: true }],
  marks: 10, difficulty: 'medium', time_limit_seconds: 2, memory_limit_mb: 256, topic: '' })
export const blankManual = () => ({ _key: uid(), question_text: '', model_answer: '', keywords: [], marks: 5, topic: '', rubric: [] })

/** Returns a list of human-readable problems for one question (mirrors backend validation). */
export function questionIssues(type, q) {
  const issues = []
  if (type === 'mcq') {
    if (!q.question_text.trim()) issues.push('question text is empty')
    const filled = q.options.filter((o) => o.text.trim())
    if (filled.length < 2) issues.push('needs at least two options')
    if (!q.correct_option_id || !filled.some((o) => o.option_id === q.correct_option_id)) issues.push('mark the correct option')
    if (new Set(filled.map((o) => o.text.trim().toLowerCase())).size !== filled.length) issues.push('options must be different')
  } else if (type === 'coding') {
    if (!q.title.trim()) issues.push('title is empty')
    if (!q.problem_statement.trim()) issues.push('problem statement is empty')
    if (!q.test_cases.length) issues.push('add at least one test case')
    if (q.test_cases.some((t) => !t.expected_output.trim())) issues.push('every test case needs an expected output')
  } else {
    if (!q.question_text.trim()) issues.push('question text is empty')
    if (!q.model_answer.trim()) issues.push('model answer is empty')
    if (q.rubric.length) {
      const sum = q.rubric.reduce((a, c) => a + Number(c.marks || 0), 0)
      if (Math.abs(sum - Number(q.marks)) > 0.01) issues.push(`rubric adds up to ${sum}, question is worth ${q.marks}`)
      if (q.rubric.some((c) => !c.criterion.trim())) issues.push('rubric criteria need names')
    }
  }
  if (!(Number(q.marks) >= 1)) issues.push('marks must be at least 1')
  return issues
}

function QuestionFrame({ index, label, onRemove, onMove, onDuplicate, issues, children, total }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-surface text-[12px] font-semibold tabular">{index + 1}</span>
          <span className="text-[13px] font-medium">{label}</span>
          {issues.length > 0 ? <Badge tone="warn">{issues.length} to fix</Badge> : <Badge tone="good" icon={Check}>Ready</Badge>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Duplicate" onClick={onDuplicate}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Remove question" onClick={onRemove}><Trash2 className="h-4 w-4 text-bad" /></Button>
        </div>
      </div>
      <div className="space-y-4 p-4">
        {children}
        {issues.length > 0 && <p className="text-[12.5px] text-warn">To fix: {issues.join(' · ')}</p>}
      </div>
    </Card>
  )
}

function MetaRow({ q, set, topics, showDifficulty = true }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Marks">{({ id }) => <Input id={id} type="number" min={1} max={200} value={q.marks} onChange={(e) => set({ marks: e.target.value === '' ? '' : Number(e.target.value) })} />}</Field>
      {showDifficulty && (
        <Field label="Difficulty">{({ id }) => (
          <Select id={id} value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </Select>)}</Field>
      )}
      <Field label="Topic" hint={topics?.length ? undefined : 'Admins can define topics per subject'}>
        {({ id }) => (
          <>
            <Input id={id} list={`topics-${q._key}`} value={q.topic || ''} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Stacks" />
            <datalist id={`topics-${q._key}`}>{(topics || []).map((t) => <option key={t} value={t} />)}</datalist>
          </>
        )}
      </Field>
    </div>
  )
}

export function McqEditor({ q, set, ...frame }) {
  const setOption = (i, text) => set({ options: q.options.map((o, j) => (j === i ? { ...o, text } : o)) })
  const addOption = () => q.options.length < 8 && set({ options: [...q.options, { option_id: String.fromCharCode(97 + q.options.length), text: '' }] })
  const removeOption = (i) => {
    const options = q.options.filter((_, j) => j !== i).map((o, j) => ({ ...o, option_id: String.fromCharCode(97 + j) }))
    const oldIndex = q.options.findIndex((o) => o.option_id === q.correct_option_id)
    set({ options, correct_option_id: oldIndex === i ? '' : oldIndex > i ? String.fromCharCode(96 + oldIndex) : q.correct_option_id })
  }
  return (
    <QuestionFrame label="Multiple choice" issues={questionIssues('mcq', q)} {...frame}>
      <Field label="Question">{({ id }) => <Textarea id={id} rows={2} value={q.question_text} onChange={(e) => set({ question_text: e.target.value })} />}</Field>
      <fieldset>
        <legend className="label mb-2">Options <span className="font-normal text-ink-3">(select the correct one)</span></legend>
        <div className="space-y-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button type="button" onClick={() => set({ correct_option_id: o.option_id })} aria-label={`Mark option ${o.option_id.toUpperCase()} correct`}
                aria-pressed={q.correct_option_id === o.option_id}
                className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[12px] font-semibold uppercase transition-colors',
                  q.correct_option_id === o.option_id ? 'border-good bg-good text-white' : 'border-line text-ink-3 hover:border-good')}>
                {q.correct_option_id === o.option_id ? <Check className="h-4 w-4" /> : o.option_id}
              </button>
              <Input aria-label={`Option ${o.option_id.toUpperCase()}`} value={o.text} onChange={(e) => setOption(i, e.target.value)} />
              {q.options.length > 2 && <Button size="icon" variant="ghost" aria-label="Remove option" onClick={() => removeOption(i)}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
        </div>
        {q.options.length < 8 && <Button type="button" size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={addOption}>Add option</Button>}
      </fieldset>
      <Field label="Explanation" hint="Optional. Shown to students who get it wrong (otherwise AI writes one).">
        {({ id }) => <Textarea id={id} rows={2} value={q.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />}
      </Field>
      <MetaRow q={q} set={set} topics={frame.topics} />
    </QuestionFrame>
  )
}

export function CodingEditor({ q, set, ...frame }) {
  const setCase = (i, patch) => set({ test_cases: q.test_cases.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  return (
    <QuestionFrame label="Coding problem" issues={questionIssues('coding', q)} {...frame}>
      <Field label="Title">{({ id }) => <Input id={id} value={q.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Two Sum" />}</Field>
      <Field label="Problem statement">{({ id }) => <Textarea id={id} rows={4} value={q.problem_statement} onChange={(e) => set({ problem_statement: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Input format">{({ id }) => <Textarea id={id} rows={2} value={q.input_format} onChange={(e) => set({ input_format: e.target.value })} />}</Field>
        <Field label="Output format">{({ id }) => <Textarea id={id} rows={2} value={q.output_format} onChange={(e) => set({ output_format: e.target.value })} />}</Field>
        <Field label="Constraints">{({ id }) => <Textarea id={id} rows={2} value={q.constraints} onChange={(e) => set({ constraints: e.target.value })} />}</Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sample input">{({ id }) => <Textarea id={id} rows={2} className="font-mono text-[13px]" value={q.sample_input} onChange={(e) => set({ sample_input: e.target.value })} />}</Field>
        <Field label="Sample output">{({ id }) => <Textarea id={id} rows={2} className="font-mono text-[13px]" value={q.sample_output} onChange={(e) => set({ sample_output: e.target.value })} />}</Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Test cases <span className="font-normal text-ink-3">· hidden cases are never shown to students</span></p>
          <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => set({ test_cases: [...q.test_cases, { input: '', expected_output: '', is_hidden: true }] })}>Add case</Button>
        </div>
        <div className="space-y-2">
          {q.test_cases.map((t, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Textarea aria-label={`Test ${i + 1} input`} rows={2} className="font-mono text-[13px]" placeholder="stdin" value={t.input} onChange={(e) => setCase(i, { input: e.target.value })} />
              <Textarea aria-label={`Test ${i + 1} expected output`} rows={2} className="font-mono text-[13px]" placeholder="expected stdout" value={t.expected_output} onChange={(e) => setCase(i, { expected_output: e.target.value })} />
              <div className="flex items-start gap-1 sm:flex-col">
                <Button type="button" size="sm" variant={t.is_hidden ? 'soft' : 'ghost'} icon={t.is_hidden ? EyeOff : Eye} onClick={() => setCase(i, { is_hidden: !t.is_hidden })}>
                  {t.is_hidden ? 'Hidden' : 'Visible'}</Button>
                {q.test_cases.length > 1 && <Button type="button" size="sm" variant="ghost" icon={Trash2} aria-label="Remove test case"
                  onClick={() => set({ test_cases: q.test_cases.filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <MetaRow q={q} set={set} topics={frame.topics} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time limit (seconds)">{({ id }) => <Input id={id} type="number" min={0.5} max={15} step={0.5} value={q.time_limit_seconds} onChange={(e) => set({ time_limit_seconds: Number(e.target.value) })} />}</Field>
        <Field label="Memory limit (MB)">{({ id }) => <Input id={id} type="number" min={32} max={512} value={q.memory_limit_mb} onChange={(e) => set({ memory_limit_mb: Number(e.target.value) })} />}</Field>
      </div>
    </QuestionFrame>
  )
}

function KeywordInput({ value, onChange }) {
  const [draft, setDraft] = useState('')
  // Commas, semicolons and new lines separate keywords, so a pasted list becomes separate keywords.
  const add = (text = draft) => {
    const next = [...value]
    text.split(/[,;\n]+/).map((k) => k.trim().replace(/\s+/g, ' ')).filter(Boolean)
      .forEach((k) => { if (!next.some((x) => x.toLowerCase() === k.toLowerCase())) next.push(k) })
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Add keyword" placeholder="e.g. LIFO, push, pop   (synonyms: CPU|processor)"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={() => draft.trim() && add()}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); add(draft + t) } }} />
        <Button type="button" variant="secondary" onClick={() => add()}>Add</Button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12.5px]">
              {k.split('|').join(' / ')}
              <button type="button" aria-label={`Remove ${k}`} onClick={() => onChange(value.filter((x) => x !== k))} className="rounded-full p-0.5 hover:bg-surface-3"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ManualEditor({ q, set, ...frame }) {
  const [useRubric, setUseRubric] = useState(q.rubric.length > 0)
  const rubricSum = q.rubric.reduce((a, c) => a + Number(c.marks || 0), 0)
  const setCrit = (i, patch) => set({ rubric: q.rubric.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <QuestionFrame label="Descriptive / handwritten" issues={questionIssues('manual', q)} {...frame}>
      <Field label="Question">{({ id }) => <Textarea id={id} rows={2} value={q.question_text} onChange={(e) => set({ question_text: e.target.value })} />}</Field>
      <Field label="Model answer" hint="What a full-marks answer contains. Used by the AI grader; never shown to students.">
        {({ id }) => <Textarea id={id} rows={4} value={q.model_answer} onChange={(e) => set({ model_answer: e.target.value })} />}
      </Field>
      <div>
        <p className="label mb-1.5">Keywords <span className="font-normal text-ink-3">· 30% of the score is keyword coverage when keywords are set</span></p>
        <KeywordInput value={q.keywords} onChange={(keywords) => set({ keywords })} />
      </div>
      <MetaRow q={q} set={set} topics={frame.topics} showDifficulty={false} />
      <div className="rounded-xl border border-line p-3">
        <Toggle checked={useRubric} label="Grade with a rubric"
          description="The AI scores each criterion separately and quotes evidence from the answer."
          onChange={(on) => { setUseRubric(on); set({ rubric: on ? (q.rubric.length ? q.rubric : [{ criterion: 'Definition', description: '', marks: Number(q.marks) || 1 }]) : [] }) }} />
        {useRubric && (
          <div className="mt-3 space-y-2">
            {q.rubric.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_90px_auto]">
                <Input aria-label="Criterion" placeholder="Criterion" value={c.criterion} onChange={(e) => setCrit(i, { criterion: e.target.value })} />
                <Input aria-label="What earns marks" placeholder="What earns these marks" value={c.description} onChange={(e) => setCrit(i, { description: e.target.value })} />
                <Input aria-label="Marks" type="number" min={0.5} step={0.5} value={c.marks} onChange={(e) => setCrit(i, { marks: Number(e.target.value) })} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remove criterion" onClick={() => set({ rubric: q.rubric.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => set({ rubric: [...q.rubric, { criterion: '', description: '', marks: 1 }] })}>Add criterion</Button>
              <span className={cn('text-[12.5px] tabular', Math.abs(rubricSum - Number(q.marks)) > 0.01 ? 'text-warn' : 'text-ink-3')}>
                {rubricSum} / {q.marks} marks allocated</span>
            </div>
          </div>
        )}
      </div>
    </QuestionFrame>
  )
}
