import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, MasteryLevel, PageHeader, PageSkeleton, StatCard, Table, TypeBadge } from '@/components/ui'
import { BarList, ChartCard, LineChart } from '@/components/charts'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDate, fmtNum, fmtPct } from '@/lib/utils'

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const p = useAsync(() => api.analytics.studentProfile(id), [id])
  useDocumentTitle(p.data?.student.name)
  if (p.loading) return <PageSkeleton />
  if (p.error) return <ErrorState error={p.error} onRetry={p.reload} />
  const d = p.data
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3"><Avatar name={d.student.name} className="h-10 w-10 text-sm" />{d.student.name}</span>}
        description={d.student.email}
        back={<button onClick={() => navigate(-1)} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back</button>}
        actions={<Button variant="secondary" icon={Download} onClick={() => api.analytics.downloadStudentPdf(id).catch((e) => toast.error(e))}>PDF report</Button>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Results" value={d.stats.total_submissions} />
        <StatCard label="Average" value={fmtPct(d.stats.average_score)} tone="info" />
        <StatCard label="Best" value={fmtPct(d.stats.best_score)} tone="good" />
        <StatCard label="Pass rate" value={fmtPct(d.stats.pass_rate)} tone="neutral" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Results over time" description="Percentage per assessment, in order taken"
          rows={d.history} columns={[{ key: 'title', header: 'Assessment' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'percentage', header: '%', align: 'right' }]}
          empty={<EmptyState title="No finalized results yet" className="py-8" />}>
          <LineChart labels={d.history.map((h) => h.title)} series={[{ name: 'Score', color: 'var(--series-1)', values: d.history.map((h) => h.percentage) }]} />
        </ChartCard>
        <ChartCard title="Topic mastery" rows={d.topics} columns={[{ key: 'topic', header: 'Topic' }, { key: 'mastery', header: 'Mastery %', align: 'right' }]}
          empty={<EmptyState title="No topic data yet" className="py-8" />}>
          <BarList rows={d.topics.map((t) => ({ label: t.topic, value: t.mastery, aside: <MasteryLevel level={t.level} /> }))} />
        </ChartCard>
        <Card className="lg:col-span-2">
          <CardHeader title="Results" />
          <Table dense rows={[...d.history].reverse()} rowKey="assessment_id" empty={<EmptyState title="No results" className="py-8" />}
            columns={[{ key: 'title', header: 'Assessment' }, { key: 'type', header: 'Type', render: (r) => <TypeBadge type={r.type} /> },
              { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'score', header: 'Score', align: 'right', render: (r) => `${fmtNum(r.score, 2)} / ${fmtNum(r.max, 2)}` },
              { key: 'percentage', header: '%', align: 'right', render: (r) => fmtPct(r.percentage) }]} />
        </Card>
        {(d.recurring_coding_issues.length > 0 || d.frequently_missed_concepts.length > 0) && (
          <Card className="lg:col-span-2 p-5">
            <p className="eyebrow mb-2">Recurring gaps</p>
            <div className="flex flex-wrap gap-1.5">
              {d.recurring_coding_issues.map((i) => <Badge key={i.issue} tone="warn">{i.issue} · {i.count}</Badge>)}
              {d.frequently_missed_concepts.map((c) => <Badge key={c.concept}>{c.concept.split('|')[0]} · {c.count}</Badge>)}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
