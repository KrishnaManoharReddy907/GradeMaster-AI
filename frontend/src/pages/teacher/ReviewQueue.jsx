import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Info } from 'lucide-react'
import {
  Callout, Card, EmptyState, ErrorState, FlagChips, PageHeader, PageSkeleton, ScorePill, Segmented, SubmissionStatus, Table, TypeBadge,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fromNow } from '@/lib/utils'

export default function ReviewQueue() {
  useDocumentTitle('Review queue')
  const navigate = useNavigate()
  const q = useAsync(() => api.teacher.queue(), [])
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => (q.data?.items || []).filter((i) => filter === 'all' || (filter === 'flagged' ? i.flags.length : i.type === filter)), [q.data, filter])
  if (q.loading) return <PageSkeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />
  const items = q.data.items

  return (
    <>
      <PageHeader title="Review queue" description="Coding and handwritten work waiting for your decision, riskiest first." />
      <Callout tone="info" icon={Info} className="mb-4">
        Items move to the top when something deserves a closer look: possible copying, instructions hidden in an answer, unreadable handwriting,
        disagreement between keyword and AI scores, or an AI outage. Nothing is released to students until you finalize it.
      </Callout>
      <Card>
        <div className="border-b border-line p-4">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: items.length }, { value: 'flagged', label: 'Flagged', count: q.data.flagged },
            { value: 'coding', label: 'Coding', count: items.filter((i) => i.type === 'coding').length },
            { value: 'manual', label: 'Handwritten', count: items.filter((i) => i.type === 'manual').length }]} />
        </div>
        <Table rows={rows} onRowClick={(r) => navigate(r.type === 'coding' ? `/teacher/coding/${r.id}` : `/teacher/manual/${r.id}`)}
          empty={<EmptyState icon={Inbox} title="Nothing waiting" description="New submissions appear here after automatic evaluation finishes." />}
          columns={[
            { key: 'student', header: 'Student', render: (r) => <span className="font-medium">{r.student_name || 'Unknown'}</span> },
            { key: 'assessment', header: 'Assessment', render: (r) => <div><p>{r.assessment_title}</p><div className="mt-0.5"><TypeBadge type={r.type} /></div></div> },
            { key: 'status', header: 'Status', render: (r) => <SubmissionStatus status={r.status} /> },
            { key: 'ai', header: 'AI score', render: (r) => <ScorePill score={r.ai_score} max={r.max_marks} /> },
            { key: 'flags', header: 'Why look', render: (r) => r.flags.length ? <FlagChips flags={r.flags} /> : <span className="text-ink-3">Routine</span> },
            { key: 'when', header: 'Submitted', render: (r) => <span className="text-ink-3">{fromNow(r.submitted_at)}</span> },
          ]} />
      </Card>
    </>
  )
}
