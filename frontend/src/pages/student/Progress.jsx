import { Bug, Download, GraduationCap, Lightbulb, Star, Target } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, MasteryLevel, PageHeader, PageSkeleton, StatCard, Table, TypeBadge } from '@/components/ui'
import { BarList, ChartCard, LineChart } from '@/components/charts'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDate, fmtNum, fmtPct } from '@/lib/utils'

export default function Progress() {
  useDocumentTitle('My progress')
  const { user } = useAuth()
  const toast = useToast()
  const d = useAsync(() => api.analytics.student(), [])
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  const a = d.data
  const download = () => api.analytics.downloadStudentPdf(user.id).catch((e) => toast.error(e))

  if (!a.stats.total_submissions) {
    return (
      <>
        <PageHeader title="My progress" />
        <Card><EmptyState icon={GraduationCap} title="No graded work yet" description="Your progress, topic strengths and focus areas appear here once your work is graded." /></Card>
      </>
    )
  }
  const withClass = a.history.some((h) => h.class_average !== null)
  return (
    <>
      <PageHeader title="My progress" description="Based on graded work only." actions={<Button variant="secondary" icon={Download} onClick={download}>Download report</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Graded results" value={a.stats.total_submissions} icon={GraduationCap} />
        <StatCard label="Average" value={fmtPct(a.stats.average_score)} icon={Target} tone="info" />
        <StatCard label="Best" value={fmtPct(a.stats.best_score)} icon={Star} tone="good" />
        <StatCard label="Passed (≥ 50%)" value={fmtPct(a.stats.pass_rate)} tone="neutral" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Score over time" description={withClass ? 'You vs class average (%)' : 'Percentage per assessment'}
          rows={a.history} columns={[{ key: 'title', header: 'Assessment' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'percentage', header: 'You %', align: 'right' }, { key: 'class_average', header: 'Class %', align: 'right', render: (r) => r.class_average ?? '—' }]}>
          <LineChart labels={a.history.map((h) => h.title)} series={[
            { name: 'You', color: 'var(--series-1)', values: a.history.map((h) => h.percentage) },
            ...(withClass ? [{ name: 'Class average', color: 'var(--series-2)', values: a.history.map((h) => h.class_average) }] : [])]} />
        </ChartCard>
        <Card>
          <CardHeader title="What to work on" />
          <CardBody className="space-y-4 text-[13.5px]">
            {a.insights.focus_areas.length > 0 && (
              <div><p className="eyebrow mb-2 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Focus topics</p>
                <ul className="space-y-1.5">{a.insights.focus_areas.map((t) => <li key={t.topic} className="flex justify-between"><span>{t.topic}</span><span className="tabular text-ink-2">{fmtPct(t.mastery)}</span></li>)}</ul></div>
            )}
            {a.insights.strengths.length > 0 && (
              <div><p className="eyebrow mb-2 flex items-center gap-1.5"><Star className="h-3.5 w-3.5" />Strengths</p>
                <div className="flex flex-wrap gap-1.5">{a.insights.strengths.map((s) => <Badge key={s} tone="good">{s}</Badge>)}</div></div>
            )}
            {a.insights.frequently_missed_concepts.length > 0 && (
              <div><p className="eyebrow mb-2 flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" />Terms you often leave out</p>
                <div className="flex flex-wrap gap-1.5">{a.insights.frequently_missed_concepts.map((c) => <Badge key={c.concept}>{c.concept.split('|')[0]}</Badge>)}</div></div>
            )}
            {a.insights.recurring_coding_issues.length > 0 && (
              <div><p className="eyebrow mb-2 flex items-center gap-1.5"><Bug className="h-3.5 w-3.5" />Recurring coding issues</p>
                <div className="flex flex-wrap gap-1.5">{a.insights.recurring_coding_issues.map((i) => <Badge key={i.issue} tone="warn">{i.issue}</Badge>)}</div></div>
            )}
            {!a.insights.focus_areas.length && !a.insights.strengths.length && <p className="text-ink-3">Keep going. Insights sharpen as more work is graded.</p>}
          </CardBody>
        </Card>
        <ChartCard title="Topic mastery" description="Recent work counts more" rows={a.topics}
          columns={[{ key: 'topic', header: 'Topic' }, { key: 'mastery', header: 'Mastery %', align: 'right' }, { key: 'items', header: 'Answers', align: 'right' }]}>
          <BarList rows={[...a.topics].reverse().map((t) => ({ label: t.topic, value: t.mastery, aside: <MasteryLevel level={t.level} /> }))} />
        </ChartCard>
        <ChartCard title="By subject" rows={a.subjects} columns={[{ key: 'subject', header: 'Subject' }, { key: 'average', header: 'Average %', align: 'right' }, { key: 'assessments', header: 'Results', align: 'right' }]}>
          <BarList rows={a.subjects.map((s) => ({ label: s.subject, value: s.average }))} />
        </ChartCard>
        <Card className="lg:col-span-2">
          <CardHeader title="All graded results" />
          <Table dense rows={[...a.history].reverse()} rowKey="assessment_id" columns={[
            { key: 'title', header: 'Assessment' }, { key: 'type', header: 'Type', render: (r) => <TypeBadge type={r.type} /> },
            { key: 'subject', header: 'Subject' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'score', header: 'Score', align: 'right', render: (r) => `${fmtNum(r.score, 2)} / ${fmtNum(r.max, 2)}` },
            { key: 'percentage', header: '%', align: 'right', render: (r) => fmtPct(r.percentage) },
            { key: 'class', header: 'Class avg', align: 'right', render: (r) => fmtPct(r.class_average) }]} />
        </Card>
      </div>
    </>
  )
}
