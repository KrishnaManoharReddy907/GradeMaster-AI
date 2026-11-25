import { useMemo, useState } from 'react'
import { BookMarked } from 'lucide-react'
import { AssessmentStatus, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, SubmissionStatus, Table, TypeBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime } from '@/lib/utils'
import { AssessmentAction } from './shared'

export default function StudentAssessments() {
  useDocumentTitle('Assessments')
  const [filter, setFilter] = useState('open')
  const d = useAsync(async () => {
    const [assessments, subs] = await Promise.all([api.student.assessments(), api.student.submissions()])
    // A partly submitted assessment (e.g. MCQ done, coding not) still counts as open while the window is open.
    const done = new Map(subs.submissions.map((s) => [s.assessment_id, s]))
    return { assessments, subs: done, has: (a) => done.has(a.id) && (done.get(a.id).complete !== false || a.status !== 'active') }
  }, [])
  const rows = useMemo(() => {
    if (!d.data) return []
    const { assessments, has } = d.data
    return assessments.filter((a) => (filter === 'open' ? a.status === 'active' && !has(a)
      : filter === 'upcoming' ? a.status === 'upcoming' : filter === 'done' ? has(a) : a.status === 'ended' && !has(a)))
  }, [d.data, filter])
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  const { assessments, subs, has } = d.data
  const c = (f) => assessments.filter((a) => (f === 'open' ? a.status === 'active' && !has(a)
    : f === 'upcoming' ? a.status === 'upcoming' : f === 'done' ? has(a) : a.status === 'ended' && !has(a))).length

  return (
    <>
      <PageHeader title="Assessments" description="Everything assigned to your section." />
      <Card>
        <div className="border-b border-line p-4">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'open', label: 'Open', count: c('open') }, { value: 'upcoming', label: 'Upcoming', count: c('upcoming') },
            { value: 'done', label: 'Submitted', count: c('done') }, { value: 'missed', label: 'Missed', count: c('missed') }]} />
        </div>
        <Table rows={rows} empty={<EmptyState icon={BookMarked} title="Nothing here" />}
          columns={[
            { key: 'title', header: 'Assessment', render: (a) => <div><p className="font-medium">{a.title}</p>
              <p className="text-[12.5px] text-ink-3">{a.subject_name} · {a.total_marks} marks{a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}</p></div> },
            { key: 'type', header: 'Type', render: (a) => <TypeBadge type={a.assessment_type} /> },
            { key: 'status', header: 'Status', render: (a) => has(a) ? <SubmissionStatus status={subs.get(a.id).status} /> : <AssessmentStatus status={a.status} /> },
            { key: 'window', header: 'Window', render: (a) => <span className="text-[13px] text-ink-3">{fmtDateTime(a.start_time)} → {fmtDateTime(a.end_time)}</span> },
            { key: 'act', header: '', align: 'right', render: (a) => <AssessmentAction a={a} submission={subs.get(a.id) || null} /> },
          ]} />
      </Card>
    </>
  )
}
