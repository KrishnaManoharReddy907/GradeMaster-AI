import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, BookmarkPlus, CalendarClock, CheckCheck, Download, FileText, Fingerprint, ListChecks, Play, Trash2, Users,
} from 'lucide-react'
import {
  AssessmentStatus, Badge, Button, Callout, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, FlagChips, Input,
  KeyValue, Modal, PageHeader, PageSkeleton, ScorePill, Segmented, SubmissionStatus, Table, Tabs, Toggle, TypeBadge,
} from '@/components/ui'
import { BarList, ChartCard, ColumnChart } from '@/components/charts'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { fmtDateTime, fmtPct, fromNow, optionLabel } from '@/lib/utils'

const toLocalInput = (v) => {
  const d = new Date(v)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openPath(s) {
  return s.type === 'coding' ? `/teacher/coding/${s.id}` : s.type === 'manual' ? `/teacher/manual/${s.id}` : `/teacher/mcq/${s.id}`
}

function SubmissionsTab({ assessment, subs, reload }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(null)
  const rows = useMemo(() => subs.filter((s) => filter === 'all' || (filter === 'review' ? ['evaluated', 'reviewed', 'failed', 'pending'].includes(s.status) && s.type !== 'mcq'
    : filter === 'flagged' ? s.review_flags?.length : s.status === 'finalized' || s.type === 'mcq')), [subs, filter])

  const evaluateOne = async (e, s) => {
    e.stopPropagation()
    setBusy(s.id)
    try { await api.teacher.evaluate(s.id); toast.info('Evaluation queued. Refresh in a moment to see results.'); setTimeout(reload, 4000) }
    catch (err) { toast.error(err) } finally { setBusy(null) }
  }

  const count = (f) => subs.filter((s) => (f === 'review' ? ['evaluated', 'reviewed', 'failed', 'pending'].includes(s.status) && s.type !== 'mcq'
    : f === 'flagged' ? s.review_flags?.length : s.status === 'finalized' || s.type === 'mcq')).length

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: subs.length }, { value: 'review', label: 'Needs review', count: count('review') },
          { value: 'flagged', label: 'Flagged', count: count('flagged') }, { value: 'done', label: 'Final', count: count('done') }]} />
        <span className="text-[13px] text-ink-3">Click a row to open it.</span>
      </div>
      <Table rows={rows} onRowClick={(s) => navigate(openPath(s))}
        empty={<EmptyState icon={Users} title={subs.length ? 'Nothing in this view' : 'No submissions yet'}
          description={subs.length ? undefined : assessment.status === 'upcoming' ? 'Opens ' + fmtDateTime(assessment.start_time) : 'Students’ work will appear here.'} />}
        columns={[
          { key: 'student', header: 'Student', render: (s) => <div><p className="font-medium">{s.student_name}</p><p className="text-[12.5px] text-ink-3">{s.student_email}</p></div> },
          ...(assessment.assessment_type === 'mixed' || assessment.coding_questions.length > 1 ? [{ key: 'part', header: 'Part', render: (s) => (
            s.type === 'coding' ? <span className="text-ink-2">Code · {assessment.coding_questions.find((q) => q.question_id === s.question_id)?.title || s.question_id}</span> : <TypeBadge type={s.type} />) }] : []),
          { key: 'status', header: 'Status', render: (s) => <SubmissionStatus status={s.status} mcq={s.type === 'mcq'} /> },
          { key: 'score', header: 'Score', render: (s) => (
            <div><ScorePill score={s.score} max={s.total_marks ?? s.max_marks} />
              {s.type !== 'mcq' && s.status !== 'finalized' && s.score !== null && s.score !== undefined && <p className="text-[11.5px] text-ink-3">AI provisional</p>}</div>) },
          { key: 'flags', header: 'Flags', render: (s) => <FlagChips flags={s.review_flags || []} max={2} /> },
          { key: 'when', header: 'Submitted', render: (s) => <span className="text-ink-3">{fromNow(s.submitted_at)}</span> },
          { key: 'act', header: '', align: 'right', render: (s) => s.type === 'coding' && ['pending', 'failed'].includes(s.status) && (
            <Button size="sm" variant="secondary" icon={Play} loading={busy === s.id} onClick={(e) => evaluateOne(e, s)}>Evaluate</Button>) },
        ]} />
    </>
  )
}

function PlagiarismTab({ id }) {
  const navigate = useNavigate()
  const report = useAsync(() => api.teacher.plagiarism(id), [id])
  if (report.loading) return <div className="p-6"><PageSkeleton /></div>
  if (report.error) return <ErrorState error={report.error} onRetry={report.reload} />
  const pairs = report.data.questions.flatMap((q) => q.pairs.map((p) => ({ ...p, question: q.title || q.question_id })))
  return (
    <>
      <div className="p-4">
        <Callout tone="info" icon={Fingerprint}>
          Similarity compares the structure of programs (identifiers and literals normalised, comments ignored), so renaming variables doesn’t hide a copy.
          A high score is a reason to look, not proof. Pairs ≥ {Math.round(report.data.thresholds.flag * 100)}% are marked high.
        </Callout>
      </div>
      <Table rows={pairs} rowKey={(p) => `${p.a}-${p.b}`} onRowClick={(p) => navigate(`/teacher/plagiarism?a=${p.a}&b=${p.b}`)}
        empty={<EmptyState icon={Fingerprint} title="No similar pairs" description="No two submissions for the same question are structurally similar." />}
        columns={[
          { key: 'pair', header: 'Students', render: (p) => <span className="font-medium">{p.student_a} ↔ {p.student_b}</span> },
          { key: 'q', header: 'Question', render: (p) => p.question },
          { key: 'score', header: 'Similarity', align: 'right', render: (p) => `${Math.round(p.score * 100)}%` },
          { key: 'level', header: '', render: (p) => <Badge tone={p.level === 'high' ? 'bad' : 'warn'}>{p.level === 'high' ? 'High' : 'Moderate'}</Badge> },
        ]} />
    </>
  )
}

function InsightsTab({ id, assessment }) {
  const data = useAsync(() => api.analytics.teacher(id), [id])
  if (data.loading) return <div className="p-6"><PageSkeleton /></div>
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  const d = data.data
  if (!d.stats.total_submissions) return <EmptyState icon={BarChart3} title="No finalized results yet" description="Insights use teacher-confirmed grades only. MCQ results count immediately." />
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="grid grid-cols-3 gap-3 lg:col-span-2">
        {[['Results', d.stats.total_submissions], ['Average', fmtPct(d.stats.average_score)], ['Pass rate', fmtPct(d.stats.pass_rate)]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 p-4"><p className="text-[12.5px] text-ink-3">{k}</p><p className="text-xl font-semibold">{v}</p></div>
        ))}
      </div>
      <ChartCard title="Score distribution" description="Number of students per score band (%)"
        rows={d.distribution} columns={[{ key: 'range', header: 'Score band (%)' }, { key: 'count', header: 'Students', align: 'right' }]}>
        <ColumnChart data={d.distribution.map((b) => ({ label: b.range, value: b.count }))} unit=" students" color="var(--seq-4)" />
      </ChartCard>
      <ChartCard title="Topic mastery" description="Average score per topic (%)"
        rows={d.topics} columns={[{ key: 'topic', header: 'Topic' }, { key: 'mastery', header: 'Mastery %', align: 'right' }, { key: 'items', header: 'Answers', align: 'right' }]}>
        <BarList rows={d.topics.map((t) => ({ label: t.topic, value: t.mastery }))} />
      </ChartCard>
      {d.hardest_questions.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="Hardest questions" description="Lowest average score first" />
          <Table dense rows={d.hardest_questions} rowKey={(q) => q.question_id} columns={[
            { key: 'q', header: 'Question', render: (q) => {
              const all = [...assessment.mcq_questions, ...assessment.coding_questions, ...assessment.manual_questions]
              const found = all.find((x) => x.question_id === q.question_id)
              return <span className="line-clamp-1">{found?.question_text || found?.title || q.question_id}</span>
            } },
            { key: 'topic', header: 'Topic' }, { key: 'attempts', header: 'Answers', align: 'right' },
            { key: 'average', header: 'Average', align: 'right', render: (q) => fmtPct(q.average) },
          ]} />
        </Card>
      )}
    </div>
  )
}

function QuestionsTab({ assessment }) {
  return (
    <div className="space-y-3 p-4">
      {assessment.mcq_questions.map((q, i) => (
        <div key={q.question_id} className="rounded-xl border border-line p-4">
          <p className="text-[12px] text-ink-3">MCQ {i + 1} · {q.marks} mark{q.marks === 1 ? '' : 's'}{q.topic ? ` · ${q.topic}` : ''}</p>
          <p className="mt-1 font-medium">{q.question_text}</p>
          <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">{q.options.map((o, oi) => (
            <li key={o.option_id} className={o.option_id === q.correct_option_id ? 'font-medium text-good' : 'text-ink-2'}>{optionLabel(oi)}. {o.text}{o.option_id === q.correct_option_id ? ' ✓' : ''}</li>))}</ul>
        </div>
      ))}
      {assessment.coding_questions.map((q, i) => (
        <div key={q.question_id} className="rounded-xl border border-line p-4">
          <p className="text-[12px] text-ink-3">Coding {i + 1} · {q.marks} marks · {q.test_cases.length} tests ({q.test_cases.filter((t) => t.is_hidden).length} hidden)</p>
          <p className="mt-1 font-medium">{q.title}</p>
          <p className="prose-answer mt-1 text-[13px] text-ink-2">{q.problem_statement}</p>
        </div>
      ))}
      {assessment.manual_questions.map((q, i) => (
        <div key={q.question_id} className="rounded-xl border border-line p-4">
          <p className="text-[12px] text-ink-3">Question {i + 1} · {q.marks} marks{q.topic ? ` · ${q.topic}` : ''}</p>
          <p className="mt-1 font-medium">{q.question_text}</p>
          <p className="prose-answer mt-2 text-[13px] text-ink-2"><span className="font-medium text-ink">Model answer: </span>{q.model_answer}</p>
          {q.keywords?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{q.keywords.map((k) => <Badge key={k}>{k}</Badge>)}</div>}
          {q.rubric?.length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">Rubric: {q.rubric.map((c) => `${c.criterion} (${c.marks})`).join(' · ')}</p>}
        </div>
      ))}
    </div>
  )
}

export default function AssessmentWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const data = useAsync(async () => {
    const [assessment, submissions] = await Promise.all([api.teacher.assessment(id), api.teacher.submissions(id)])
    return { assessment, submissions: submissions.submissions }
  }, [id])
  useDocumentTitle(data.data?.assessment.title)
  const [tab, setTab] = useState('submissions')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [schedule, setSchedule] = useState(null)

  if (data.loading) return <PageSkeleton />
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  const { assessment: a, submissions: subs } = data.data
  const hasCoding = a.coding_questions.length > 0
  const pendingCoding = subs.filter((s) => s.type === 'coding' && ['pending', 'failed'].includes(s.status)).length
  const finalizable = subs.filter((s) => s.type === 'coding' && ['evaluated', 'reviewed'].includes(s.status)).length

  const run = async (fn, success) => {
    setBusy(true)
    try { const r = await fn(); toast.success(typeof success === 'function' ? success(r) : success); setConfirm(null); data.reload(); return r }
    catch (err) { toast.error(err) } finally { setBusy(false) }
  }

  const saveSchedule = async () => {
    const ok = await run(() => api.teacher.updateAssessment(id, {
      end_time: new Date(schedule.end).toISOString(), ...(a.status === 'upcoming' ? { start_time: new Date(schedule.start).toISOString() } : {}),
      release_questions_after_deadline: schedule.release,
    }), 'Schedule updated')
    if (ok) setSchedule(null)
  }

  return (
    <>
      <PageHeader title={a.title} description={a.description}
        back={<Link to="/teacher/assessments" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Assessments</Link>}
        actions={<>
          {hasCoding && pendingCoding > 0 && <Button variant="secondary" icon={Play} onClick={() => run(() => api.teacher.evaluateAll(id), (r) => `${r.queued} submission${r.queued === 1 ? '' : 's'} queued for evaluation`)}>Evaluate {pendingCoding} pending</Button>}
          {hasCoding && finalizable > 0 && <Button variant="secondary" icon={CheckCheck} onClick={() => setConfirm('finalize')}>Finalize coding ({finalizable})</Button>}
          {a.status === 'ended' && <Link to={`/teacher/assessments/${id}/report`}><Button icon={FileText}>Report</Button></Link>}
        </>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card><CardBody>
          <KeyValue className="lg:grid-cols-4" items={[
            ['Status', <AssessmentStatus key="s" status={a.status} />], ['Type', <TypeBadge key="t" type={a.assessment_type} />],
            ['Subject', a.subject_name], ['Total marks', `${a.total_marks} · ${a.question_count} questions`],
            ['Opens', fmtDateTime(a.start_time)], ['Closes', fmtDateTime(a.end_time)],
            ['Time per student', a.duration_minutes ? `${a.duration_minutes} min` : 'Untimed'], ['Submissions', subs.length],
          ]} />
        </CardBody></Card>
        <Card className="flex flex-row flex-wrap items-center gap-2 p-4 lg:flex-col lg:items-stretch">
          {a.status !== 'ended' && <Button variant="secondary" icon={CalendarClock} onClick={() => setSchedule({ start: toLocalInput(a.start_time), end: toLocalInput(a.end_time), release: a.release_questions_after_deadline })}>Edit schedule</Button>}
          <Button variant="secondary" icon={BookmarkPlus} onClick={() => run(() => api.teacher.importToBank(id), (r) => `${r.added} question${r.added === 1 ? '' : 's'} saved to your bank`)}>Save to bank</Button>
          <Button variant="secondary" icon={Download} onClick={() => api.analytics.downloadAssessmentPdf(id).catch((e) => toast.error(e))}>PDF report</Button>
          {a.status === 'upcoming' && !subs.length && <Button variant="ghost" icon={Trash2} className="text-bad" onClick={() => setConfirm('delete')}>Delete</Button>}
        </Card>
      </div>

      <Card>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'submissions', label: 'Submissions', icon: Users, count: subs.length },
            ...(hasCoding ? [{ value: 'plagiarism', label: 'Similarity', icon: Fingerprint }] : []),
            { value: 'insights', label: 'Insights', icon: BarChart3 },
            { value: 'questions', label: 'Questions', icon: ListChecks, count: a.question_count },
          ]} />
        </div>
        {tab === 'submissions' && <SubmissionsTab assessment={a} subs={subs} reload={data.reload} />}
        {tab === 'plagiarism' && <PlagiarismTab id={id} />}
        {tab === 'insights' && <InsightsTab id={id} assessment={a} />}
        {tab === 'questions' && <QuestionsTab assessment={a} />}
      </Card>

      <ConfirmDialog open={confirm === 'finalize'} onClose={() => setConfirm(null)} loading={busy} confirmLabel={`Finalize ${finalizable}`}
        title="Finalize all evaluated coding submissions?"
        message="Each submission keeps your reviewed score, or the AI score if you didn’t change it. Finalized grades are released to students and can’t be edited."
        onConfirm={() => run(() => api.teacher.finalizeAllCoding(id), (r) => `${r.finalized} finalized`)} />
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} loading={busy} danger confirmLabel="Delete"
        title="Delete this assessment?" message="It hasn’t started and has no submissions. This can’t be undone."
        onConfirm={async () => { if (await run(() => api.teacher.deleteAssessment(id), 'Assessment deleted')) navigate('/teacher/assessments') }} />
      <Modal open={Boolean(schedule)} onClose={() => setSchedule(null)} title="Edit schedule"
        footer={<><Button variant="secondary" onClick={() => setSchedule(null)}>Cancel</Button><Button loading={busy} onClick={saveSchedule}>Save</Button></>}>
        {schedule && (
          <div className="grid gap-4">
            {a.status === 'upcoming'
              ? <Field label="Opens">{({ id: fid }) => <Input id={fid} type="datetime-local" value={schedule.start} onChange={(e) => setSchedule({ ...schedule, start: e.target.value })} />}</Field>
              : <Callout tone="info">The assessment is live, so only the closing time can change. Extending it gives everyone more time to start.</Callout>}
            <Field label="Closes">{({ id: fid }) => <Input id={fid} type="datetime-local" value={schedule.end} onChange={(e) => setSchedule({ ...schedule, end: e.target.value })} />}</Field>
            <Toggle checked={schedule.release} onChange={(v) => setSchedule({ ...schedule, release: v })} label="Release question paper after closing" />
          </div>
        )}
      </Modal>
    </>
  )
}
