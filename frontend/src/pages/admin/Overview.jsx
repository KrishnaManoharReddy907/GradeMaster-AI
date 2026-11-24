import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, Building2, CheckCircle2, ClipboardCheck, Cpu, Database, FileStack, GraduationCap, Presentation,
  ScanText, Sparkles, UserCheck, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, PageHeader, PageSkeleton, StatCard } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { TYPE_LABELS } from '@/lib/utils'

function ServiceRow({ icon: Icon, name, info, optional }) {
  const ok = info?.status === 'ok' || info?.status === 'configured'
  const missing = info?.status === 'not_configured'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2.5"><Icon className="h-4 w-4 text-ink-3" />{name}{optional && <span className="text-[12px] text-ink-3">optional</span>}</span>
      <span className="flex items-center gap-2">
        {info?.latency_ms !== undefined && ok && <span className="tabular text-[12px] text-ink-3">{info.latency_ms} ms</span>}
        {ok ? <Badge tone="good" icon={CheckCircle2}>{info.status === 'configured' ? 'Configured' : 'Healthy'}</Badge>
          : missing ? <Badge tone={optional ? 'neutral' : 'warn'}>Not configured</Badge>
            : <Badge tone={optional ? 'neutral' : 'bad'} icon={XCircle}>{optional ? 'Offline' : 'Unreachable'}</Badge>}
      </span>
    </li>
  )
}

export default function Overview() {
  useDocumentTitle('Admin overview')
  const overview = useAsync(() => api.admin.overview(), [])
  const health = useAsync(() => api.admin.health(), [])
  if (overview.loading) return <PageSkeleton />
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />
  const o = overview.data
  const staff = (o.users.faculty || 0) + (o.users.teacher || 0) + (o.users.hod || 0)
  const totalSubs = o.submissions.mcq + o.submissions.coding + o.submissions.manual
  const s = health.data?.services

  return (
    <>
      <PageHeader title="Overview" description="Institution setup, people and platform health." />
      {o.pending_approvals > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn-soft px-5 py-4">
          <p className="flex items-center gap-2 font-medium"><UserCheck className="h-4 w-4 text-warn" />
            {o.pending_approvals} faculty sign-up{o.pending_approvals > 1 ? 's' : ''} waiting for approval</p>
          <Link to="/admin/approvals"><Button size="sm" variant="secondary" icon={ArrowRight}>Review</Button></Link>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={o.users.student || 0} icon={GraduationCap} />
        <StatCard label="Teaching staff" value={staff} icon={Presentation} tone="info" />
        <StatCard label="Assessments" value={Object.values(o.assessments).reduce((a, b) => a + b, 0)} icon={ClipboardCheck} tone="good"
          hint={Object.entries(o.assessments).map(([k, v]) => `${v} ${TYPE_LABELS[k] || k}`).join(' · ') || 'None yet'} />
        <StatCard label="Submissions" value={totalSubs} icon={FileStack} tone="neutral"
          hint={`${o.pending_reviews.coding + o.pending_reviews.manual} awaiting teacher review`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader title="Academic structure" action={<Link to="/admin/academics"><Button size="sm" variant="ghost">Manage</Button></Link>} />
          <CardBody className="grid grid-cols-3 gap-4 text-center">
            {[['Departments', o.departments], ['Sections', o.sections], ['Subjects', o.subjects]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 py-4">
                <p className="text-2xl font-semibold">{v}</p><p className="text-[13px] text-ink-3">{k}</p>
              </div>
            ))}
          </CardBody>
          <div className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
            Set up order: departments → sections & subjects → approve faculty → teaching assignments.
          </div>
        </Card>
        <Card>
          <CardHeader title="System health" description="Live checks of the database and external services."
            action={<Button size="sm" variant="ghost" icon={Activity} loading={health.loading} onClick={health.reload}>Re-check</Button>} />
          <CardBody className="py-2">
            {health.error ? <ErrorState error={health.error} onRetry={health.reload} /> : (
              <ul className="divide-y divide-line">
                <ServiceRow icon={Database} name="Database" info={s?.database} />
                <ServiceRow icon={Cpu} name="Code execution (Judge0)" info={s?.judge0} />
                <ServiceRow icon={Sparkles} name="Gemini AI" info={s?.gemini} />
                <ServiceRow icon={ScanText} name="Google Vision OCR" info={s?.google_vision} optional />
                <ServiceRow icon={Building2} name="Local LLM (Ollama)" info={s?.ollama} optional />
              </ul>
            )}
            {health.data?.jobs && (
              <p className="border-t border-line py-2.5 text-[12.5px] text-ink-3">
                Background jobs: {Object.entries(health.data.jobs).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
