import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, Table } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime } from '@/lib/utils'

const PAGE = 50
const FILTERS = [
  ['', 'All actions'], ['user.', 'Accounts'], ['assessment.', 'Assessments'], ['coding.', 'Coding grades'],
  ['manual.', 'Handwritten grades'], ['assignment.', 'Assignments'], ['ai.', 'AI usage'],
]

function describe(e) {
  const d = e.details || {}
  if (d.old !== undefined && d.new !== undefined) return `score ${d.old ?? '—'} → ${d.new}`
  if (d.final_score !== undefined) return `final score ${d.final_score}`
  return d.title || d.name || d.email || (d.role && `role ${d.role}`) || (d.topic && `${d.count ?? ''} × ${d.type} on “${d.topic}”`) || ''
}

export default function Audit() {
  useDocumentTitle('Audit log')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const log = useAsync(() => api.admin.audit({ action, skip: page * PAGE, limit: PAGE }), [action, page])
  const total = log.data?.total || 0

  return (
    <>
      <PageHeader title="Audit log" description="Security- and grade-relevant actions, newest first. Entries can’t be edited."
        actions={<Select aria-label="Filter actions" value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }} className="w-52">
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>} />
      <Card>
        {log.error ? <ErrorState error={log.error} onRetry={log.reload} /> : log.loading && !log.data
          ? <div className="space-y-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          : <Table rows={log.data.items} dense empty={<EmptyState icon={ScrollText} title="No entries" />}
            columns={[
              { key: 'when', header: 'When', render: (e) => <span className="tabular whitespace-nowrap text-ink-3">{fmtDateTime(e.created_at)}</span> },
              { key: 'who', header: 'Who', render: (e) => <span>{e.actor_name || 'System'} <span className="text-ink-3">{e.actor_role}</span></span> },
              { key: 'action', header: 'Action', render: (e) => <Badge>{e.action}</Badge> },
              { key: 'details', header: 'Details', render: (e) => <span className="text-ink-2">{describe(e)}</span> },
            ]} />}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-ink-3">
            <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Older</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
