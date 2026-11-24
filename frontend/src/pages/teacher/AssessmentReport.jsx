import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, RefreshCw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton, StatCard, Table } from '@/components/ui'
import { BarList, ChartCard, ColumnChart } from '@/components/charts'
import Markdown from '@/components/Markdown'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDateTime, fmtNum, fmtPct } from '@/lib/utils'

function Recommendation({ text }) {
  if (!text) return null
  return (
    <Card>
      <CardHeader title="Teaching recommendation" description="AI-written from the statistics above; use your judgement." action={<Badge tone="brand" icon={Sparkles}>AI</Badge>} />
      <CardBody><Markdown text={text} /></CardBody>
    </Card>
  )
}

export default function AssessmentReport() {
  const { id } = useParams()
  const toast = useToast()
  const r = useAsync(() => api.analytics.report(id), [id])
  useDocumentTitle(r.data ? `${r.data.assessment_title} report` : 'Report')
  const [regen, setRegen] = useState(false)

  const regenerate = async () => {
    setRegen(true)
    try { r.setData(await api.analytics.regenerate(id)); toast.success('Report regenerated with the latest grades') }
    catch (e) { toast.error(e) } finally { setRegen(false) }
  }

  if (r.loading) return <PageSkeleton />
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />
  const d = r.data
  const c = d.common || {}
  const dist = Object.entries(c.score_distribution || {}).map(([range, count]) => ({ range, count }))
  const mcq = d.mcq_insights, coding = d.coding_insights, manual = d.manual_insights

  return (
    <>
      <PageHeader title={`${d.assessment_title}: report`} description={`Generated ${fmtDateTime(d.generated_at)} from finalized grades.`}
        back={<Link to={`/teacher/assessments/${id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back to assessment</Link>}
        actions={<>
          <Button variant="secondary" icon={RefreshCw} loading={regen} onClick={regenerate}>Regenerate</Button>
          <Button icon={Download} onClick={() => api.analytics.downloadAssessmentPdf(id).catch((e) => toast.error(e))}>Download PDF</Button>
        </>} />
      {!c.total_submissions ? (
        <Card><EmptyState title="No finalized results yet" description="Finalize submissions, then regenerate the report." /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Participation" value={c.total_eligible ? fmtPct(c.participation_rate) : `${c.total_submissions}`}
              hint={c.total_eligible ? `${c.total_submissions} of ${c.total_eligible} students` : 'students with results'} />
            <StatCard label="Average" value={fmtPct(c.average_score)} hint={`Median ${fmtPct(c.median_score)}`} tone="info" />
            <StatCard label="Range" value={`${fmtNum(c.lowest_score)}–${fmtNum(c.highest_score)}%`} tone="neutral" />
            <StatCard label="Pass rate" value={fmtPct(c.pass_rate)} tone={c.pass_rate >= 70 ? 'good' : 'warn'} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Score distribution" description="Students per score band (%)" rows={dist}
              columns={[{ key: 'range', header: 'Band (%)' }, { key: 'count', header: 'Students', align: 'right' }]}>
              <ColumnChart data={dist.map((b) => ({ label: b.range, value: b.count }))} unit=" students" color="var(--seq-4)" />
            </ChartCard>
            <Card>
              <CardHeader title="Performers" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {[['Top', c.top_performers], ['Need support', c.bottom_performers]].map(([title, list]) => (
                  <div key={title}><p className="eyebrow mb-2">{title}</p>
                    {list?.length ? <ul className="space-y-1.5 text-[13px]">{list.map((p, i) => (
                      <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tabular text-ink-2">{fmtPct(p.score)}</span></li>))}</ul>
                      : <p className="text-[13px] text-ink-3">—</p>}</div>
                ))}
              </div>
            </Card>
          </div>

          {mcq && (
            <>
              <Card>
                <CardHeader title="Question analysis" description="Most-missed first; the most common wrong option shows the misconception." />
                <Table dense rows={mcq.question_analysis || []} rowKey="question_id" columns={[
                  { key: 'question_text', header: 'Question', render: (q) => <span className="line-clamp-2">{q.question_text}</span> },
                  { key: 'correct_pct', header: 'Correct', align: 'right', render: (q) => fmtPct(q.correct_pct) },
                  { key: 'wrong', header: 'Common wrong answer', render: (q) => q.most_wrong_option ? `${q.most_wrong_option.toUpperCase()} (${q.most_wrong_count})` : '—' },
                  { key: 'total_attempts', header: 'Answers', align: 'right' },
                ]} />
              </Card>
              <Recommendation text={mcq.teaching_recommendation} />
            </>
          )}
          {coding && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card><CardHeader title="Tests passed on average" /><CardBody><p className="text-3xl font-semibold">{fmtPct(coding.avg_test_pass_rate)}</p></CardBody></Card>
                <Card><CardHeader title="Languages used" />
                  <CardBody><BarList unit="" max={Math.max(1, ...Object.values(coding.language_distribution || {}))}
                    rows={Object.entries(coding.language_distribution || {}).map(([k, v]) => ({ label: k, value: v }))} /></CardBody></Card>
              </div>
              {coding.common_issues?.length > 0 && (
                <Card><CardHeader title="Most common issues" />
                  <CardBody className="flex flex-wrap gap-1.5">{coding.common_issues.map((i) => <Badge key={i.issue} tone="warn">{i.issue} · {i.count}</Badge>)}</CardBody></Card>
              )}
              <Recommendation text={coding.teaching_recommendation} />
            </>
          )}
          {manual && (
            <>
              <ChartCard title="Per-question average" description="Average score as % of the question’s marks; weakest first"
                rows={manual.per_question_avg || []} columns={[{ key: 'question_text', header: 'Question' },
                  { key: 'average_score', header: 'Average', align: 'right', render: (q) => `${fmtNum(q.average_score, 2)} / ${q.max_marks}` },
                  { key: 'average_percentage', header: '%', align: 'right' }]}>
                <BarList rows={(manual.per_question_avg || []).map((q) => ({ label: q.question_text || q.question_id, value: q.average_percentage }))} />
              </ChartCard>
              {manual.keywords_by_question?.length > 0 && (
                <Card><CardHeader title="Key terms students missed" />
                  <CardBody className="space-y-3">{manual.keywords_by_question.map((k) => (
                    <div key={k.question_id || k.question_text}><p className="mb-1 text-[13px] font-medium">{k.question_text}</p>
                      <div className="flex flex-wrap gap-1.5">{(k.missed_keywords || []).map((m) => (
                        <Badge key={m.keyword}>{m.keyword.split('|')[0]} · {m.count}</Badge>))}</div></div>))}</CardBody></Card>
              )}
              <Recommendation text={manual.teaching_recommendation} />
            </>
          )}
        </div>
      )}
    </>
  )
}
