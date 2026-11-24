import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Fingerprint } from 'lucide-react'
import { Badge, Button, Callout, Card, CardBody, CardHeader, ErrorState, PageHeader, PageSkeleton } from '@/components/ui'
import { CodeView, LANGUAGE_LABEL } from '@/components/code'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'

export default function PlagiarismCompare() {
  useDocumentTitle('Compare submissions')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const a = params.get('a'), b = params.get('b')
  const cmp = useAsync(() => api.teacher.compare(a, b), [a, b])
  if (cmp.loading) return <PageSkeleton />
  if (cmp.error) return <ErrorState error={cmp.error} onRetry={cmp.reload} />
  const d = cmp.data
  return (
    <>
      <PageHeader title="Side-by-side comparison" description="Highlighted lines share normalised structure with the other submission."
        back={<button onClick={() => navigate(-1)} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back</button>}
        actions={<Badge tone={d.level === 'high' ? 'bad' : d.level === 'moderate' ? 'warn' : 'good'} icon={Fingerprint}>{Math.round(d.score * 100)}% similar · {d.level}</Badge>} />
      <Callout tone="info" className="mb-4">Similar structure can also come from a short, standard solution. Talk to the students before concluding anything.</Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        {[d.a, d.b].map((side) => (
          <Card key={side.id}>
            <CardHeader title={side.student || 'Unknown'} description={`${LANGUAGE_LABEL[side.language] || side.language} · ${side.matched_lines.length} matching lines`}
              action={<Button size="sm" variant="ghost" onClick={() => navigate(`/teacher/coding/${side.id}`)}>Open</Button>} />
            <CardBody><CodeView code={side.code} highlight={side.matched_lines} maxHeight={640} /></CardBody>
          </Card>
        ))}
      </div>
    </>
  )
}
