import { useState } from 'react'
import { BookOpen, Building2, Layers, Plus, Tags, X } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageSkeleton, Select, Table, Tabs,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useCatalog } from '@/lib/catalog'
import { useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDate } from '@/lib/utils'

function TopicEditor({ value, onChange }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setDraft('')
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Linked lists"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} aria-label="New topic" />
        <Button type="button" variant="secondary" onClick={add}>Add</Button>
      </div>
      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-[12.5px] text-brand">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="rounded-full p-0.5 hover:bg-brand/10">
                <X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Academics() {
  useDocumentTitle('Academics')
  const toast = useToast()
  const cat = useCatalog()
  const [tab, setTab] = useState('departments')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [pending, setPending] = useState(false)

  const open = (kind, initial = {}) => { setForm(initial); setModal(kind) }
  const save = async (e) => {
    e.preventDefault()
    setPending(true)
    try {
      if (modal === 'department') await api.admin.createDepartment({ name: form.name, code: form.code || null })
      if (modal === 'section') await api.admin.createSection({ name: form.name, year: Number(form.year), department_id: form.department_id })
      if (modal === 'subject') await api.admin.createSubject({ name: form.name, code: form.code || null, year: Number(form.year), department_id: form.department_id, topics: form.topics || [] })
      if (modal === 'topics') await api.admin.setTopics(form.id, form.topics)
      toast.success('Saved')
      setModal(null)
      cat.reload()
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }

  if (cat.loading) return <PageSkeleton />
  if (cat.error) return <ErrorState error={cat.error} onRetry={cat.reload} />
  const deptName = (id) => cat.deptById[id]?.name || '—'
  const needsDept = !cat.departments.length

  return (
    <>
      <PageHeader title="Academics" description="Departments, sections and subjects. Subjects carry the topic list used for topic-mastery analytics."
        actions={<>
          <Button variant="secondary" icon={Plus} onClick={() => open('department')}>Department</Button>
          <Button variant="secondary" icon={Plus} disabled={needsDept} onClick={() => open('section', { year: '1', department_id: cat.departments[0]?.id })}>Section</Button>
          <Button icon={Plus} disabled={needsDept} onClick={() => open('subject', { year: '1', department_id: cat.departments[0]?.id, topics: [] })}>Subject</Button>
        </>} />
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'departments', label: 'Departments', icon: Building2, count: cat.departments.length },
            { value: 'sections', label: 'Sections', icon: Layers, count: cat.sections.length },
            { value: 'subjects', label: 'Subjects', icon: BookOpen, count: cat.subjects.length },
          ]} />
        </div>
        {tab === 'departments' && (
          <Table rows={cat.departments} empty={<EmptyState icon={Building2} title="No departments yet" description="Start by adding a department, e.g. Information Technology."
            action={<Button icon={Plus} onClick={() => open('department')}>Add department</Button>} />}
            columns={[
              { key: 'name', header: 'Name', render: (d) => <span className="font-medium">{d.name}</span> },
              { key: 'code', header: 'Code', render: (d) => d.code || '—' },
              { key: 'sections', header: 'Sections', align: 'right', render: (d) => cat.sections.filter((s) => s.department_id === d.id).length },
              { key: 'subjects', header: 'Subjects', align: 'right', render: (d) => cat.subjects.filter((s) => s.department_id === d.id).length },
              { key: 'created', header: 'Created', render: (d) => <span className="text-ink-3">{fmtDate(d.created_at)}</span> },
            ]} />
        )}
        {tab === 'sections' && (
          <Table rows={[...cat.sections].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))}
            empty={<EmptyState icon={Layers} title="No sections yet" />}
            columns={[
              { key: 'name', header: 'Section', render: (s) => <span className="font-medium">{s.name}</span> },
              { key: 'year', header: 'Year', render: (s) => `Year ${s.year}` },
              { key: 'dept', header: 'Department', render: (s) => deptName(s.department_id) },
              { key: 'created', header: 'Created', render: (s) => <span className="text-ink-3">{fmtDate(s.created_at)}</span> },
            ]} />
        )}
        {tab === 'subjects' && (
          <Table rows={cat.subjects} empty={<EmptyState icon={BookOpen} title="No subjects yet" />}
            columns={[
              { key: 'name', header: 'Subject', render: (s) => <div><span className="font-medium">{s.name}</span>{s.code && <span className="ml-2 text-ink-3">{s.code}</span>}</div> },
              { key: 'year', header: 'Year', render: (s) => `Year ${s.year}` },
              { key: 'dept', header: 'Department', render: (s) => deptName(s.department_id) },
              { key: 'topics', header: 'Topics', render: (s) => s.topics?.length
                ? <div className="flex max-w-md flex-wrap gap-1">{s.topics.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}{s.topics.length > 4 && <Badge>+{s.topics.length - 4}</Badge>}</div>
                : <span className="text-ink-3">None</span> },
              { key: 'edit', header: '', align: 'right', render: (s) => <Button size="sm" variant="ghost" icon={Tags} onClick={() => open('topics', { id: s.id, name: s.name, topics: s.topics || [] })}>Topics</Button> },
            ]} />
        )}
      </Card>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)}
        title={{ department: 'New department', section: 'New section', subject: 'New subject', topics: `Topics · ${form.name}` }[modal]}
        description={modal === 'topics' ? 'Teachers tag questions with these topics; analytics groups scores by them.' : undefined}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" form="academic-form" loading={pending}>Save</Button></>}>
        <form id="academic-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {modal !== 'topics' && (
            <Field label="Name" className={modal === 'section' ? 'sm:col-span-2' : ''}>
              {({ id }) => <Input id={id} required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={modal === 'section' ? 'e.g. A' : modal === 'subject' ? 'e.g. Data Structures' : 'e.g. Information Technology'} />}
            </Field>
          )}
          {(modal === 'department' || modal === 'subject') && (
            <Field label="Code" hint="Optional short code">{({ id }) => <Input id={id} value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />}</Field>
          )}
          {(modal === 'section' || modal === 'subject') && (
            <>
              <Field label="Department">{({ id }) => (
                <Select id={id} required value={form.department_id || ''} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  {cat.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>)}</Field>
              <Field label="Year">{({ id }) => (
                <Select id={id} value={form.year || '1'} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                  {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </Select>)}</Field>
            </>
          )}
          {(modal === 'subject' || modal === 'topics') && (
            <div className="sm:col-span-2"><p className="label mb-1.5">Topics</p>
              <TopicEditor value={form.topics || []} onChange={(topics) => setForm({ ...form, topics })} /></div>
          )}
        </form>
      </Modal>
    </>
  )
}
