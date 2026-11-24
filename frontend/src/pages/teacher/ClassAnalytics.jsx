import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart3, Bug, Target, TrendingUp, Users } from 'lucide-react'
import {
  Badge, Card, CardHeader, EmptyState, ErrorState, MasteryLevel, PageHeader, PageSkeleton, StatCard, Table,
} from '@/components/ui'
import { BarList, ChartCard, ColumnChart, LineChart } from '@/components/charts'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { fmtDate, fmtPct, TYPE_LABELS } from '@/lib/utils'

export default function ClassAnalytics() {
  useDocumentTitle('Class analytics')
  const navigate = useNavigate()
  const d = useAsync(() => api.analytics.teacher(), [])
  if (d.loading) return <PageSkeleton />
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />
  const a = d.data
  const graded = a.per_assessment.filter((x) => x.average !== null)

  if (!a.stats.total_submissions) {
    return (
      <>
        <PageHeader title="Class analytics" />
        <Card><EmptyState icon={BarChart3} title="No finalized results yet" description="Analytics use teacher-confirmed grades. MCQ results count immediately; coding and handwritten work after you finalize it." /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Class analytics" description="Built only from finalized grades across your assessments. Pass mark is 50%." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students with results" value={a.stats.total_students} icon={Users} />
        <StatCard label="Results" value={a.stats.total_submissions} icon={BarChart3} tone="neutral" />
        <StatCard label="Average score" value={fmtPct(a.stats.average_score)} icon={TrendingUp} tone="info" />
        <StatCard label="Pass rate" value={fmtPct(a.stats.pass_rate)} icon={Target} tone={a.stats.pass_rate >= 70 ? 'good' : 'warn'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Average score per assessment" description="Percentage of total marks" className="lg:col-span-2"
          rows={graded} columns={[{ key: 'title', header: 'Assessment' }, { key: 'type', header: 'Type', render: (r) => TYPE_LABELS[r.type] },
            { key: 'submissions', header: 'Results', align: 'right' }, { key: 'average', header: 'Average %', align: 'right' }, { key: 'pass_rate', header: 'Pass %', align: 'right' }]}>
          <ColumnChart data={graded.slice(0, 14).reverse().map((x) => ({ label: x.title, value: x.average, sub: `${x.submissions} results` }))} max={100} />
        </ChartCard>
        <ChartCard title="Score trend" description="Daily average of results by submission date (%)"
          rows={a.trend} columns={[{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'submissions', header: 'Results', align: 'right' }, { key: 'average', header: 'Average %', align: 'right' }]}>
          <LineChart labels={a.trend.map((t) => fmtDate(t.date))} series={[{ name: 'Average', color: 'var(--series-1)', values: a.trend.map((t) => t.average), area: true }]} />
        </ChartCard>
        <ChartCard title="Score distribution" description="Results per score band (%)"
          rows={a.distribution} columns={[{ key: 'range', header: 'Band (%)' }, { key: 'count', header: 'Results', align: 'right' }]}>
          <ColumnChart data={a.distribution.map((b) => ({ label: b.range, value: b.count }))} unit=" results" color="var(--seq-4)" />
        </ChartCard>
        <ChartCard title="Topic mastery" description="Recency-weighted average per topic; weakest first"
          rows={a.topics} columns={[{ key: 'topic', header: 'Topic' }, { key: 'mastery', header: 'Mastery %', align: 'right' }, { key: 'students', header: 'Students', align: 'right' }, { key: 'items', header: 'Answers', align: 'right' }]}>
          <BarList rows={a.topics.slice(0, 10).map((t) => ({ label: t.topic, value: t.mastery, aside: <MasteryLevel level={t.level} /> }))} />
        </ChartCard>
        <Card>
          <CardHeader title="Students who may need support" description="Average below 50% across their results" />
          <Table dense rows={a.at_risk} rowKey="student_id" onRowClick={(s) => navigate(`/teacher/students/${s.student_id}`)}
            empty={<EmptyState icon={Users} title="No one below the pass mark" className="py-8" />}
            columns={[
              { key: 'name', header: 'Student', render: (s) => <span className="flex items-center gap-2 font-medium"><AlertTriangle className="h-3.5 w-3.5 text-warn" />{s.name}</span> },
              { key: 'assessments', header: 'Results', align: 'right' }, { key: 'average', header: 'Average', align: 'right', render: (s) => fmtPct(s.average) },
            ]} />
        </Card>
        <Card>
          <CardHeader title="Hardest questions" description="Lowest class average (at least two answers)" />
          <Table dense rows={a.hardest_questions} rowKey={(q) => q.assessment_id + q.question_id}
            empty={<EmptyState title="Not enough answers yet" className="py-8" />}
            columns={[{ key: 'question_text', header: 'Question', render: (q) => <div><p className="line-clamp-2">{q.question_text}</p>
              <p className="text-[12px] text-ink-3">{q.assessment_title}</p></div> }, { key: 'topic', header: 'Topic' },
              { key: 'average', header: 'Average', align: 'right', render: (q) => fmtPct(q.average) }]} />
        </Card>
        {(a.common_coding_issues.length > 0 || a.frequently_missed_concepts.length > 0) && (
          <Card className="lg:col-span-2">
            <CardHeader title="Recurring mistakes" description="Teach to these" />
            <div className="grid gap-6 p-5 sm:grid-cols-2">
              <div><p className="eyebrow mb-2 flex items-center gap-1.5"><Bug className="h-3.5 w-3.5" />Coding issues</p>
                <div className="flex flex-wrap gap-1.5">{a.common_coding_issues.map((i) => <Badge key={i.issue} tone="warn">{i.issue} · {i.count}</Badge>)}
                  {!a.common_coding_issues.length && <span className="text-[13px] text-ink-3">None recorded</span>}</div></div>
              <div><p className="eyebrow mb-2">Concepts often missing from written answers</p>
                <div className="flex flex-wrap gap-1.5">{a.frequently_missed_concepts.map((c) => <Badge key={c.concept}>{c.concept.split('|')[0]} · {c.count}</Badge>)}
                  {!a.frequently_missed_concepts.length && <span className="text-[13px] text-ink-3">None recorded</span>}</div></div>
            </div>
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CardHeader title="All students" description="Open a student for their topic profile" />
          <Table dense rows={a.students} rowKey="student_id" onRowClick={(s) => navigate(`/teacher/students/${s.student_id}`)}
            columns={[{ key: 'name', header: 'Student', render: (s) => <span className="font-medium">{s.name}</span> },
              { key: 'assessments', header: 'Results', align: 'right' }, { key: 'average', header: 'Average', align: 'right', render: (s) => fmtPct(s.average) }]} />
        </Card>
      </div>
    </>
  )
}
