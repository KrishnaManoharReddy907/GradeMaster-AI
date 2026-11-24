import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, Flag, Inbox, Plus, Radio, TrendingUp, Users } from 'lucide-react'
import {
  AssessmentStatus, Button, Card, CardHeader, EmptyState, ErrorState, FlagChips, PageHeader, PageSkeleton, StatCard, Table, TypeBadge,
} from '@/components/ui'
import { BarList } from '@/components/charts'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime, fmtPct, fromNow } from '@/lib/utils'

export default function TeacherDashboard() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const navigate = useNavigate()
  const data = useAsync(async () => {
    const [assessments, stats, queue, analytics] = await Promise.all([
      api.teacher.assessments(), api.teacher.stats(), api.teacher.queue(), api.analytics.teacher()])
    return { assessments, stats, queue, analytics }
  }, [])
  if (data.loading) return <PageSkeleton />
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  const { assessments, stats, queue, analytics } = data.data
  const live = assessments.filter((a) => a.status === 'active')
  const upcoming = assessments.filter((a) => a.status === 'upcoming')
  const recent = [...live, ...upcoming, ...assessments.filter((a) => a.status === 'ended')].slice(0, 6)
  const weakTopics = (analytics.topics || []).filter((t) => t.level !== 'strong').slice(0, 5)

  return (
    <>
      <PageHeader title={`Good to see you, ${user.name.split(' ')[0]}`} description="Here’s what needs your attention."
        actions={<Link to="/teacher/assessments/new"><Button icon={Plus}>New assessment</Button></Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting your review" value={queue.total} icon={Inbox} tone={queue.total ? 'warn' : 'good'}
          hint={queue.flagged ? `${queue.flagged} flagged for attention` : 'Nothing flagged'} />
        <StatCard label="Live now" value={live.length} icon={Radio} tone="good" hint={`${upcoming.length} upcoming`} />
        <StatCard label="Students graded" value={analytics.stats.total_students} icon={Users} tone="info"
          hint={`${analytics.stats.total_submissions} finalized results`} />
        <StatCard label="Class average" value={fmtPct(analytics.stats.total_submissions ? analytics.stats.average_score : null)} icon={TrendingUp}
          tone="neutral" hint={analytics.stats.total_submissions ? `${fmtPct(analytics.stats.pass_rate)} pass rate` : 'No finalized results yet'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Review queue" description="Riskiest first. Flags explain why an item needs a closer look."
            action={<Link to="/teacher/review"><Button size="sm" variant="ghost" icon={ArrowRight}>Open queue</Button></Link>} />
          <Table rows={queue.items.slice(0, 6)} onRowClick={(r) => navigate(r.type === 'coding' ? `/teacher/coding/${r.id}` : `/teacher/manual/${r.id}`)}
            empty={<EmptyState icon={Inbox} title="Queue is empty" description="Submissions appear here after automatic evaluation." />}
            columns={[
              { key: 'student', header: 'Student', render: (r) => <span className="font-medium">{r.student_name || 'Unknown'}</span> },
              { key: 'assessment', header: 'Assessment', render: (r) => <span className="text-ink-2">{r.assessment_title}</span> },
              { key: 'flags', header: 'Flags', render: (r) => r.flags.length ? <FlagChips flags={r.flags} max={2} /> : <span className="text-ink-3">—</span> },
              { key: 'when', header: 'Submitted', render: (r) => <span className="text-ink-3">{fromNow(r.submitted_at)}</span> },
            ]} />
        </Card>
        <Card>
          <CardHeader title="Topics to revisit" description="Weakest topics across finalized results." />
          <div className="p-5">
            {weakTopics.length ? (
              <BarList rows={weakTopics.map((t) => ({ label: t.topic, value: t.mastery }))} color="var(--series-1)" />
            ) : <EmptyState icon={Flag} title="No weak topics yet" description="Topic mastery appears once results are finalized." className="py-8" />}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Your assessments" action={<Link to="/teacher/assessments"><Button size="sm" variant="ghost" icon={ArrowRight}>View all</Button></Link>} />
        <Table rows={recent} onRowClick={(a) => navigate(`/teacher/assessments/${a.id}`)}
          empty={<EmptyState icon={ClipboardCheck} title="No assessments yet" description="Create your first MCQ, coding or handwritten assessment."
            action={<Link to="/teacher/assessments/new"><Button icon={Plus}>New assessment</Button></Link>} />}
          columns={[
            { key: 'title', header: 'Title', render: (a) => <div><p className="font-medium">{a.title}</p><p className="text-[12.5px] text-ink-3">{a.subject_name}</p></div> },
            { key: 'type', header: 'Type', render: (a) => <TypeBadge type={a.assessment_type} /> },
            { key: 'status', header: 'Status', render: (a) => <AssessmentStatus status={a.status} /> },
            { key: 'subs', header: 'Submissions', align: 'right', render: (a) => stats[a.id]?.submissions_count ?? 0 },
            { key: 'pending', header: 'To review', align: 'right', render: (a) => stats[a.id]?.pending_count || <span className="text-ink-3">0</span> },
            { key: 'end', header: 'Closes', render: (a) => <span className="text-ink-3">{fmtDateTime(a.end_time)}</span> },
          ]} />
      </Card>
    </>
  )
}
