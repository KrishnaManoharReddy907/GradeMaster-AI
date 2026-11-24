import { useEffect, useState } from 'react'
import { LibraryBig, Search, Share2, Sparkles, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, Segmented, Select, Skeleton, TypeBadge,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDate, optionLabel } from '@/lib/utils'

const PAGE = 30

function Preview({ item }) {
  const q = item.question
  if (item.type === 'mcq') {
    return (
      <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
        {q.options.map((o, oi) => <li key={o.option_id} className={o.option_id === q.correct_option_id ? 'font-medium text-good' : 'text-ink-2'}>
          {optionLabel(oi)}. {o.text}{o.option_id === q.correct_option_id ? ' ✓' : ''}</li>)}
      </ul>
    )
  }
  if (item.type === 'coding') return <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{q.problem_statement}</p>
  return <p className="mt-1 line-clamp-2 text-[13px] text-ink-2"><span className="font-medium text-ink">Model answer: </span>{q.model_answer}</p>
}

export default function QuestionBank() {
  useDocumentTitle('Question bank')
  const toast = useToast()
  const { user } = useAuth()
  const assignments = useAsync(() => api.teacher.myAssignments(), [])
  const [subject, setSubject] = useState('')
  const [type, setType] = useState('')
  const [topic, setTopic] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300); return () => clearTimeout(t) }, [search])
  const bank = useAsync(() => api.teacher.bank({ subject_id: subject, type, topic, search: debounced, skip: page * PAGE, limit: PAGE }),
    [subject, type, topic, debounced, page])

  const remove = async () => {
    setBusy(true)
    try { await api.teacher.removeFromBank(removing.id); toast.success('Removed from bank'); setRemoving(null); bank.reload() }
    catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const subjects = assignments.data?.subjects || []
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || 'Other subject'
  const total = bank.data?.total || 0

  return (
    <>
      <PageHeader title="Question bank" description="Questions you’ve saved, plus ones colleagues shared for your subjects. Add them to new assessments from the builder." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented value={type} onChange={(v) => { setType(v); setPage(0) }} options={[
            { value: '', label: 'All' }, { value: 'mcq', label: 'MCQ' }, { value: 'coding', label: 'Coding' }, { value: 'manual', label: 'Descriptive' }]} />
          <Select aria-label="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(''); setPage(0) }} className="w-48">
            <option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {bank.data?.topics?.length > 0 && (
            <Select aria-label="Topic" value={topic} onChange={(e) => { setTopic(e.target.value); setPage(0) }} className="w-44">
              <option value="">All topics</option>{bank.data.topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input aria-label="Search questions" placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        {bank.error ? <ErrorState error={bank.error} onRetry={bank.reload} /> : bank.loading && !bank.data ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : !bank.data.items.length ? (
          <EmptyState icon={LibraryBig} title="Your bank is empty" description="Use “Save to bank” on an assessment, or “Save questions to bank” in the builder." />
        ) : (
          <ul className="divide-y divide-line">
            {bank.data.items.map((it) => (
              <li key={it.id} className="flex items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.question.question_text || it.question.title}</p>
                  <Preview item={it} />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={it.type} />
                    <Badge>{subjectName(it.subject_id)}</Badge>
                    {it.topic && <Badge tone="brand">{it.topic}</Badge>}
                    <Badge>{it.question.marks} mark{it.question.marks === 1 ? '' : 's'}</Badge>
                    {it.source === 'ai' && <Badge tone="brand" icon={Sparkles}>AI draft</Badge>}
                    {it.shared && <Badge icon={Share2}>Shared</Badge>}
                    <span className="text-[12px] text-ink-3">Saved {fmtDate(it.created_at)}{it.usage_count ? ` · used ${it.usage_count}×` : ''}</span>
                  </div>
                </div>
                {(it.owner_id === user.id || user.role === 'admin') && (
                  <Button size="icon" variant="ghost" aria-label="Remove from bank" onClick={() => setRemoving(it)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-ink-3">
            <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} danger confirmLabel="Remove"
        title="Remove from bank?" message="Assessments that already use this question are not affected." />
    </>
  )
}
