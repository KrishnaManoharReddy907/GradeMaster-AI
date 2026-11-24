import { Link } from 'react-router-dom'
import { ArrowRight, BookMarked, CalendarClock, CheckCircle2, Sparkles, Target, TrendingUp } from 'lucide-react'
import {
  AssessmentStatus, Button, Card, CardHeader, EmptyState, ErrorState, MasteryLevel, PageHeader, PageSkeleton, StatCard, SubmissionStatus, Table, TypeBadge,
} from '@/components/ui'
import { BarList } from '@/components/charts'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDateTime, fmtPct, fromNow } from '@/lib/utils'
import { AssessmentAction } from './shared'

export default function StudentDashboard() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const d = useAsync(async () => {
    const [assessments, subs, analytics] = await Promise.all([api.student.assessments(), api.student.submissions(), api.analytics.student()])
    return { assessments, subs: subs.submissions, analytics }
  }, [])
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  const { assessments, subs, analytics } = d.data
  const submittedIds = new Map(subs.map((s) => [s.assessment_id, s]))
  const todo = assessments.filter((a) => a.status === 'active' && !submittedIds.has(a.id))
  const upcoming = assessments.filter((a) => a.status === 'upcoming')
  const focus = analytics.insights.focus_areas

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]}`} description={todo.length ? `You have ${todo.length} assessment${todo.length > 1 ? 's' : ''} open right now.` : 'You’re all caught up.'} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open now" value={todo.length} icon={BookMarked} tone={todo.length ? 'warn' : 'good'} hint={`${upcoming.length} upcoming`} />
        <StatCard label="Graded results" value={analytics.stats.total_submissions} icon={CheckCircle2} tone="good" />
        <StatCard label="Average score" value={fmtPct(analytics.stats.total_submissions ? analytics.stats.average_score : null)} icon={TrendingUp} tone="info" />
        <StatCard label="Best score" value={fmtPct(analytics.stats.total_submissions ? analytics.stats.best_score : null)} icon={Target} tone="neutral" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="To do" description="Open assessments you haven’t submitted" />
          <Table rows={todo} empty={<EmptyState icon={CheckCircle2} title="Nothing due" description="New assessments appear here when they open." />}
            columns={[
              { key: 'title', header: 'Assessment', render: (a) => <div><p className="font-medium">{a.title}</p><p className="text-[12.5px] text-ink-3">{a.subject_name}</p></div> },
              { key: 'type', header: 'Type', render: (a) => <TypeBadge type={a.assessment_type} /> },
              { key: 'due', header: 'Closes', render: (a) => <span className="flex items-center gap-1.5 text-ink-2"><CalendarClock className="h-3.5 w-3.5" />{fromNow(a.end_time)}</span> },
              { key: 'act', header: '', align: 'right', render: (a) => <AssessmentAction a={a} /> },
            ]} />
        </Card>
        <Card>
          <CardHeader title="Focus areas" description="Your weakest topics so far" action={<Link to="/student/progress"><Button size="sm" variant="ghost" icon={ArrowRight}>Progress</Button></Link>} />
          <div className="p-5">
            {focus.length ? <BarList rows={focus.map((t) => ({ label: t.topic, value: t.mastery }))} />
              : <EmptyState icon={Sparkles} title="No focus areas yet" description="Once your work is graded, topics to practise show up here." className="py-6" />}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming" />
          <Table dense rows={upcoming.slice(0, 5)} empty={<EmptyState title="Nothing scheduled" className="py-8" />}
            columns={[{ key: 'title', header: 'Assessment', render: (a) => <span className="font-medium">{a.title}</span> },
              { key: 'status', header: '', render: (a) => <AssessmentStatus status={a.status} /> },
              { key: 'opens', header: 'Opens', render: (a) => <span className="text-ink-3">{fmtDateTime(a.start_time)}</span> }]} />
        </Card>
        <Card>
          <CardHeader title="Recent submissions" action={<Link to="/student/results"><Button size="sm" variant="ghost" icon={ArrowRight}>All</Button></Link>} />
          <Table dense rows={subs.slice(0, 5)} rowKey="assessment_id" empty={<EmptyState title="No submissions yet" className="py-8" />}
            columns={[{ key: 'title', header: 'Assessment', render: (s) => <Link to={`/student/results/${s.assessment_id}`} className="font-medium hover:underline">{s.assessment_title}</Link> },
              { key: 'status', header: 'Status', render: (s) => <SubmissionStatus status={s.status} /> },
              { key: 'score', header: 'Score', align: 'right', render: (s) => s.status === 'graded' ? `${s.score} / ${s.max_score}` : '—' }]} />
        </Card>
      </div>
      {analytics.topics.length > 0 && (
        <Card className="mt-6 p-5">
          <p className="mb-3 text-[15px] font-semibold">Topic snapshot</p>
          <div className="flex flex-wrap gap-2">{analytics.topics.slice(-8).reverse().map((t) => (
            <span key={t.topic} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-[13px]">{t.topic}<MasteryLevel level={t.level} /></span>))}</div>
        </Card>
      )}
    </>
  )
}
