import { useEffect, useState } from 'react'
import { Search, UserPlus, Users as UsersIcon } from 'lucide-react'
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Table,
} from '@/components/ui'
import { api } from '@/lib/api'
import { sectionLabel, useCatalog } from '@/lib/catalog'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/ui-state'
import { fromNow } from '@/lib/utils'

const PAGE = 25
const ROLE_TONE = { admin: 'brand', faculty: 'info', teacher: 'info', hod: 'info', student: 'neutral' }

function CreateStaffModal({ open, onClose, onCreated, departments }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'faculty', department_id: '' })
  const [pending, setPending] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setPending(true)
    try {
      const u = await api.admin.createStaff({ ...form, department_id: form.department_id || null })
      toast.success(`${u.name} can sign in now`, 'Staff account created')
      onCreated()
      onClose()
      setForm({ name: '', email: '', password: '', role: 'faculty', department_id: '' })
    } catch (err) { toast.error(err) } finally { setPending(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add staff member" description="Staff accounts created here are approved immediately."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="staff-form" type="submit" loading={pending}>Create account</Button></>}>
      <form id="staff-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">{({ id }) => <Input id={id} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Email" className="sm:col-span-2">{({ id }) => <Input id={id} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Role">{({ id }) => (
          <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="faculty">Faculty</option><option value="hod">Head of department</option>
          </Select>)}</Field>
        <Field label="Department">{({ id }) => (
          <Select id={id} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>)}</Field>
        <Field label="Temporary password" className="sm:col-span-2" hint="Share it securely; they can change it from Account settings.">
          {({ id }) => <Input id={id} type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
      </form>
    </Modal>
  )
}

export default function Users() {
  useDocumentTitle('People')
  const toast = useToast()
  const { user: me } = useAuth()
  const catalog = useCatalog()
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300); return () => clearTimeout(t) }, [search])
  const users = useAsync(() => api.admin.users({ role, search: debounced, skip: page * PAGE, limit: PAGE }), [role, debounced, page])

  const toggleActive = async () => {
    setBusy(true)
    try {
      await api.admin.setActive(toggling.id, !toggling.is_active)
      toast.success(toggling.is_active ? `${toggling.name} was deactivated and signed out` : `${toggling.name} was reactivated`)
      setToggling(null)
      users.reload()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }

  const total = users.data?.total || 0
  return (
    <>
      <PageHeader title="People" description="Everyone with an account. Deactivating someone signs them out immediately."
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Add staff</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented value={role} onChange={(v) => { setRole(v); setPage(0) }} options={[
            { value: '', label: 'All' }, { value: 'student', label: 'Students' }, { value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Admins' }]} />
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input aria-label="Search people" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        {users.error ? <ErrorState error={users.error} onRetry={users.reload} /> : users.loading && !users.data ? (
          <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <Table rows={users.data.users}
            empty={<EmptyState icon={UsersIcon} title="No one matches" description="Try a different search or filter." />}
            columns={[
              { key: 'name', header: 'Person', render: (u) => (
                <div className="flex items-center gap-3"><Avatar name={u.name} />
                  <div className="min-w-0"><p className="font-medium">{u.name}{u.id === me.id && <span className="text-ink-3"> (you)</span>}</p>
                    <p className="truncate text-[12.5px] text-ink-3">{u.email}</p></div></div>) },
              { key: 'role', header: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge> },
              { key: 'where', header: 'Section / department', render: (u) => u.role === 'student'
                ? sectionLabel(catalog.sectionById[u.section_id], catalog.deptById) : catalog.deptById[u.department_id]?.name || '—' },
              { key: 'status', header: 'Status', render: (u) => u.rejected ? <Badge tone="bad">Rejected</Badge>
                : !u.is_active ? <Badge tone="bad">Deactivated</Badge> : !u.approved ? <Badge tone="warn">Pending</Badge> : <Badge tone="good">Active</Badge> },
              { key: 'login', header: 'Last sign-in', render: (u) => <span className="text-ink-3">{u.last_login_at ? fromNow(u.last_login_at) : 'Never'}</span> },
              { key: 'actions', header: '', align: 'right', render: (u) => u.id !== me.id && !u.rejected && (
                <Button size="sm" variant={u.is_active ? 'ghost' : 'secondary'} onClick={() => setToggling(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</Button>) },
            ]} />
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
      <CreateStaffModal open={creating} onClose={() => setCreating(false)} onCreated={users.reload} departments={catalog.departments} />
      <ConfirmDialog open={Boolean(toggling)} onClose={() => setToggling(null)} onConfirm={toggleActive} loading={busy}
        danger={toggling?.is_active} confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        title={toggling?.is_active ? 'Deactivate account?' : 'Reactivate account?'}
        message={toggling?.is_active ? `${toggling?.name} will be signed out everywhere and won’t be able to sign in. Their submissions are kept.`
          : `${toggling?.name} will be able to sign in again.`} />
    </>
  )
}
