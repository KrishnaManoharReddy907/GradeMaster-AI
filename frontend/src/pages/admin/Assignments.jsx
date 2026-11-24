import { useMemo, useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import {
  Avatar, Badge, Button, Callout, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, PageSkeleton, Select, Table,
} from '@/components/ui'
import { api } from '@/lib/api'
import { sectionLabel, useCatalog } from '@/lib/catalog'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'

export default function Assignments() {
  useDocumentTitle('Teaching assignments')
  const toast = useToast()
  const cat = useCatalog()
  const assignments = useAsync(() => api.admin.assignments(), [])
  const teachers = useAsync(() => api.admin.approvedTeachers(), [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ teacher_id: '', subject_id: '', section_ids: [] })
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState(null)

  const subject = cat.subjectById[form.subject_id]
  const eligibleSections = useMemo(() => (subject ? cat.sections.filter((s) => s.year === subject.year && s.department_id === subject.department_id) : []),
    [subject, cat.sections])

  const startEdit = (a) => {
    setForm(a ? { teacher_id: a.teacher_id, subject_id: a.subject_id, section_ids: a.section_ids } : { teacher_id: '', subject_id: '', section_ids: [] })
    setOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setPending(true)
    try {
      await api.admin.assign(form)
      toast.success('Assignment saved')
      setOpen(false)
      assignments.reload()
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }

  const remove = async () => {
    setPending(true)
    try {
      await api.admin.removeAssignment(removing.id)
      toast.success('Assignment removed')
      setRemoving(null)
      assignments.reload()
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }

  if (cat.loading || assignments.loading) return <PageSkeleton />
  if (assignments.error) return <ErrorState error={assignments.error} onRetry={assignments.reload} />

  return (
    <>
      <PageHeader title="Teaching assignments" description="Which teacher teaches which subject to which sections. Teachers can only create assessments for their assignments."
        actions={<Button icon={Plus} onClick={() => startEdit(null)} disabled={!teachers.data?.length || !cat.subjects.length}>Assign teacher</Button>} />
      {!teachers.data?.length && !teachers.loading && (
        <Callout tone="info" className="mb-4">No approved teachers yet. Approve faculty sign-ups or add staff from People first.</Callout>
      )}
      <Card>
        <Table rows={assignments.data}
          empty={<EmptyState icon={ClipboardList} title="No assignments yet" description="Assign a teacher to a subject and one or more sections." />}
          columns={[
            { key: 'teacher', header: 'Teacher', render: (a) => <div className="flex items-center gap-2.5"><Avatar name={a.teacher_name} /><span className="font-medium">{a.teacher_name || 'Unknown'}</span></div> },
            { key: 'subject', header: 'Subject', render: (a) => a.subject_name || '—' },
            { key: 'sections', header: 'Sections', render: (a) => (
              <div className="flex flex-wrap gap-1">{a.section_ids.map((id) => <Badge key={id}>{sectionLabel(cat.sectionById[id], cat.deptById)}</Badge>)}</div>) },
            { key: 'actions', header: '', align: 'right', render: (a) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(a)}>Edit</Button>
                <Button size="icon" variant="ghost" aria-label="Remove assignment" onClick={() => setRemoving(a)}><Trash2 className="h-4 w-4" /></Button>
              </div>) },
          ]} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign teacher"
        description="Saving an existing teacher + subject pair replaces its sections."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="assign-form" loading={pending} disabled={!form.teacher_id || !form.subject_id || !form.section_ids.length}>Save</Button></>}>
        <form id="assign-form" onSubmit={save} className="space-y-4">
          <Field label="Teacher">{({ id }) => (
            <Select id={id} required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">Select a teacher</option>
              {(teachers.data || []).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}
            </Select>)}</Field>
          <Field label="Subject">{({ id }) => (
            <Select id={id} required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value, section_ids: [] })}>
              <option value="">Select a subject</option>
              {cat.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · Year {s.year} · {cat.deptById[s.department_id]?.name}</option>)}
            </Select>)}</Field>
          {subject && (
            <div>
              <p className="label mb-2">Sections <span className="font-normal text-ink-3">(year {subject.year}, same department)</span></p>
              {eligibleSections.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {eligibleSections.map((s) => (
                    <Checkbox key={s.id} label={`Section ${s.name}`} checked={form.section_ids.includes(s.id)}
                      onChange={(c) => setForm({ ...form, section_ids: c ? [...form.section_ids, s.id] : form.section_ids.filter((x) => x !== s.id) })}
                      className="rounded-lg border border-line px-3 py-2" />
                  ))}
                </div>
              ) : <Callout tone="warn">No sections exist for this subject’s year and department.</Callout>}
            </div>
          )}
        </form>
      </Modal>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} loading={pending} danger confirmLabel="Remove"
        title="Remove assignment?" message={`${removing?.teacher_name} will no longer be able to create assessments for ${removing?.subject_name}. Existing assessments are not affected.`} />
    </>
  )
}
