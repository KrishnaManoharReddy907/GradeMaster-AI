import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, Plus, Search } from 'lucide-react'
import {
  AssessmentStatus, Button, Card, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Segmented, Table, TypeBadge,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime } from '@/lib/utils'

export default function TeacherAssessments() {
  useDocumentTitle('Assessments')
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const data = useAsync(async () => {
    const [assessments, stats] = await Promise.all([api.teacher.assessments(), api.teacher.stats()])
    return { assessments, stats }
  }, [])
  const rows = useMemo(() => (data.data?.assessments || [])
    .filter((a) => status === 'all' || a.status === status)
    .filter((a) => !query || `${a.title} ${a.subject_name}`.toLowerCase().includes(query.toLowerCase())), [data.data, status, query])

  if (data.loading) return <PageSkeleton />
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  const all = data.data.assessments
  const count = (s) => all.filter((a) => a.status === s).length
  const stats = data.data.stats

  return (
    <>
      <PageHeader title="Assessments" description="Everything you’ve created, with submission and review progress."
        actions={<Link to="/teacher/assessments/new"><Button icon={Plus}>New assessment</Button></Link>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All', count: all.length }, { value: 'active', label: 'Live', count: count('active') },
            { value: 'upcoming', label: 'Upcoming', count: count('upcoming') }, { value: 'ended', label: 'Ended', count: count('ended') }]} />
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input aria-label="Search assessments" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table rows={rows} onRowClick={(a) => navigate(`/teacher/assessments/${a.id}`)}
          empty={<EmptyState icon={ClipboardCheck} title={all.length ? 'Nothing matches' : 'No assessments yet'}
            description={all.length ? 'Try another filter.' : 'Create an MCQ, coding or handwritten assessment for your sections.'}
            action={!all.length && <Link to="/teacher/assessments/new"><Button icon={Plus}>New assessment</Button></Link>} />}
          columns={[
            { key: 'title', header: 'Assessment', render: (a) => <div><p className="font-medium">{a.title}</p>
              <p className="text-[12.5px] text-ink-3">{a.subject_name} · {a.question_count} question{a.question_count === 1 ? '' : 's'} · {a.total_marks} marks</p></div> },
            { key: 'type', header: 'Type', render: (a) => <TypeBadge type={a.assessment_type} /> },
            { key: 'status', header: 'Status', render: (a) => <AssessmentStatus status={a.status} /> },
            { key: 'window', header: 'Window', render: (a) => <span className="text-[13px] text-ink-3">{fmtDateTime(a.start_time)} → {fmtDateTime(a.end_time)}</span> },
            { key: 'subs', header: 'Submissions', align: 'right', render: (a) => stats[a.id]?.submissions_count ?? 0 },
            { key: 'review', header: 'To review', align: 'right', render: (a) => stats[a.id]?.pending_count
              ? <span className="font-semibold text-warn">{stats[a.id].pending_count}</span> : <span className="text-ink-3">0</span> },
          ]} />
      </Card>
    </>
  )
}
