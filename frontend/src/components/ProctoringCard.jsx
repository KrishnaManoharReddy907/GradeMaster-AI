import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader } from './ui'
import { fmtDateTime } from '@/lib/utils'

/** Teacher view of a proctored attempt: violation count and timeline. Renders nothing if not proctored. */
export default function ProctoringCard({ proctoring }) {
  if (!proctoring) return null
  const { violations, max_violations: max, terminated, events = [] } = proctoring
  return (
    <Card>
      <CardHeader title="Proctoring" description="Fullscreen and tab-switch monitoring during the exam."
        action={violations
          ? <Badge tone={terminated ? 'bad' : 'warn'} icon={ShieldAlert}>{violations} of {max}{terminated ? ' · auto-submitted' : ''}</Badge>
          : <Badge tone="good" icon={ShieldCheck}>No violations</Badge>} />
      {events.length > 0 && (
        <CardBody>
          <ol className="space-y-2 text-[13px]">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-warn" />{e.label}</span>
                <span className="tabular text-ink-3">{fmtDateTime(e.at)}</span>
              </li>
            ))}
          </ol>
        </CardBody>
      )}
    </Card>
  )
}
