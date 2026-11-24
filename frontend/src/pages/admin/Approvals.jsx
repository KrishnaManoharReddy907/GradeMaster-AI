import { useState } from 'react'
import { Check, UserCheck, X } from 'lucide-react'
import { Avatar, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, PageSkeleton, Table } from '@/components/ui'
import { api } from '@/lib/api'
import { useCatalog } from '@/lib/catalog'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fromNow } from '@/lib/utils'

export default function Approvals() {
  useDocumentTitle('Approvals')
  const toast = useToast()
  const pending = useAsync(() => api.admin.pending(), [])
  const { deptById } = useCatalog()
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const act = async (user, action) => {
    setBusy(user.id)
    try {
      await (action === 'approve' ? api.admin.approve(user.id) : api.admin.reject(user.id))
      toast.success(action === 'approve' ? `${user.name} can now sign in` : `${user.name}'s sign-up was rejected`)
      pending.setData((rows) => rows.filter((r) => r.id !== user.id))
      setRejecting(null)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  if (pending.loading) return <PageSkeleton />
  if (pending.error) return <ErrorState error={pending.error} onRetry={pending.reload} />

  return (
    <>
      <PageHeader title="Approvals" description="Faculty who signed up and are waiting for access. Approve only people you recognise." />
      <Card>
        <Table rows={pending.data}
          empty={<EmptyState icon={UserCheck} title="You’re all caught up" description="New faculty sign-ups will appear here." />}
          columns={[
            { key: 'name', header: 'Person', render: (u) => (
              <div className="flex items-center gap-3"><Avatar name={u.name} />
                <div className="min-w-0"><p className="font-medium">{u.name}</p><p className="truncate text-[12.5px] text-ink-3">{u.email}</p></div></div>) },
            { key: 'role', header: 'Role', render: (u) => <span className="capitalize">{u.role}</span> },
            { key: 'dept', header: 'Department', render: (u) => deptById[u.department_id]?.name || '—' },
            { key: 'created', header: 'Signed up', render: (u) => <span className="text-ink-3">{fromNow(u.created_at)}</span> },
            { key: 'actions', header: '', align: 'right', render: (u) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" icon={X} disabled={busy === u.id} onClick={() => setRejecting(u)}>Reject</Button>
                <Button size="sm" icon={Check} loading={busy === u.id} onClick={() => act(u, 'approve')}>Approve</Button>
              </div>) },
          ]} />
      </Card>
      <ConfirmDialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} danger confirmLabel="Reject sign-up"
        loading={busy === rejecting?.id} onConfirm={() => act(rejecting, 'reject')} title="Reject this sign-up?"
        message={`${rejecting?.name} (${rejecting?.email}) won’t be able to sign in. The record is kept in the audit log.`} />
    </>
  )
}
