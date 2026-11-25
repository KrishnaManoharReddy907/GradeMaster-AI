/** Small components that know GradeMaster's vocabulary (statuses, types, flags). */
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Code2, FileText, Flag, ListChecks, Loader2, Lock, PenLine, XCircle } from 'lucide-react'
import { Badge } from './primitives'
import { FLAG_LABELS, TYPE_LABELS, cn, fmtNum } from '@/lib/utils'

const TYPE_ICON = { mcq: ListChecks, coding: Code2, manual: PenLine, mixed: FileText }

export function TypeBadge({ type }) {
  return <Badge tone="neutral" icon={TYPE_ICON[type] || FileText}>{TYPE_LABELS[type] || type}</Badge>
}

export function TypeIcon({ type, className }) {
  const Icon = TYPE_ICON[type] || FileText
  return <Icon className={cn('h-4 w-4', className)} aria-hidden />
}

const ASSESSMENT_STATUS = {
  upcoming: { tone: 'info', label: 'Upcoming', icon: Clock },
  active: { tone: 'good', label: 'Live', icon: CircleDashed },
  ended: { tone: 'neutral', label: 'Ended', icon: Lock },
}

export function AssessmentStatus({ status }) {
  const s = ASSESSMENT_STATUS[status] || ASSESSMENT_STATUS.ended
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>
}

const SUBMISSION_STATUS = {
  pending: { tone: 'neutral', label: 'Queued', icon: Clock },
  evaluating: { tone: 'info', label: 'Evaluating', icon: Loader2 },
  evaluated: { tone: 'warn', label: 'Needs review', icon: AlertTriangle },
  needs_review: { tone: 'warn', label: 'Needs review', icon: AlertTriangle },
  reviewed: { tone: 'brand', label: 'Reviewed', icon: CheckCircle2 },
  finalized: { tone: 'good', label: 'Finalized', icon: Lock },
  failed: { tone: 'bad', label: 'Evaluation failed', icon: XCircle },
  submitted: { tone: 'neutral', label: 'Submitted', icon: Clock },
  in_review: { tone: 'info', label: 'In review', icon: Clock },
  graded: { tone: 'good', label: 'Graded', icon: CheckCircle2 },
  partial: { tone: 'brand', label: 'Partly graded', icon: CheckCircle2 },
}

export function SubmissionStatus({ status, mcq }) {
  if (mcq) return <Badge tone="good" icon={CheckCircle2}>Auto-graded</Badge>
  const s = SUBMISSION_STATUS[status] || { tone: 'neutral', label: status }
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>
}

export function FlagChips({ flags = [], max = 3 }) {
  if (!flags.length) return null
  const shown = flags.slice(0, max)
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((f) => <Badge key={f} tone={f.includes('plagiarism') || f.includes('injection') || f === 'evaluation_failed' ? 'bad' : 'warn'} icon={Flag}>
        {FLAG_LABELS[f] || f.replaceAll('_', ' ')}</Badge>)}
      {flags.length > max && <Badge tone="neutral">+{flags.length - max}</Badge>}
    </div>
  )
}

/** Score shown as "7.5 / 10" with a percentage tone. */
export function ScorePill({ score, max, className }) {
  if (score === null || score === undefined) return <span className="text-ink-3">—</span>
  const pct = max ? (score / max) * 100 : 0
  const tone = pct >= 75 ? 'text-good' : pct >= 50 ? 'text-ink' : 'text-bad'
  return (
    <span className={cn('tabular font-semibold', tone, className)}>
      {fmtNum(score, 2)}<span className="font-normal text-ink-3"> / {fmtNum(max, 2)}</span>
    </span>
  )
}

/** Mastery level: icon + label + value (never colour alone). */
export function MasteryLevel({ level }) {
  const map = {
    strong: { tone: 'good', label: 'Strong', icon: CheckCircle2 },
    developing: { tone: 'warn', label: 'Developing', icon: CircleDashed },
    needs_work: { tone: 'bad', label: 'Needs work', icon: AlertTriangle },
  }
  const m = map[level] || map.developing
  return <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>
}
