import { useNavigate } from 'react-router-dom'
import { FileClock } from 'lucide-react'
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, ScorePill, SubmissionStatus, Table, TypeBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime, fmtNum } from '@/lib/utils'

export default function Results() {
  useDocumentTitle('Results')
  const navigate = useNavigate()
  const d = useAsync(() => api.student.submissions(), [])
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  return (
    <>
      <PageHeader title="Results" description="Scores appear once your teacher finalizes them (MCQ scores may appear immediately)." />
      <Card>
        <Table rows={d.data.submissions} rowKey="assessment_id" onRowClick={(s) => navigate(`/student/results/${s.assessment_id}`)}
          empty={<EmptyState icon={FileClock} title="No submissions yet" />}
          columns={[
            { key: 'title', header: 'Assessment', render: (s) => <div><p className="font-medium">{s.assessment_title}</p><p className="text-[12.5px] text-ink-3">{s.subject_name}</p></div> },
            { key: 'type', header: 'Type', render: (s) => <TypeBadge type={s.assessment_type} /> },
            { key: 'status', header: 'Status', render: (s) => <SubmissionStatus status={s.status} /> },
            { key: 'score', header: 'Score', render: (s) => s.status === 'graded' ? <ScorePill score={s.score} max={s.max_score} />
              : s.status === 'partial' ? <div><span className="tabular">{fmtNum(s.graded_score)} / {fmtNum(s.graded_max)}</span><p className="text-[12px] text-ink-3">so far · rest after closing</p></div>
                : <span className="text-ink-3">{s.note ? 'After closing' : 'Pending'}</span> },
            { key: 'when', header: 'Submitted', render: (s) => <span className="text-ink-3">{fmtDateTime(s.submitted_at)}</span> },
          ]} />
      </Card>
    </>
  )
}
