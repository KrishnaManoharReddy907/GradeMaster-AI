import { Link } from 'react-router-dom'
import { BookOpenCheck, Code2, ListChecks, PenLine, Play } from 'lucide-react'
import { Badge, Button } from '@/components/ui'

export const takePath = (type, id) => ({ mcq: `/student/take/mcq/${id}`, coding: `/student/take/coding/${id}`, manual: `/student/take/handwritten/${id}` }[type])

/** The right call-to-action for an assessment row given its status and the student's submission. */
export function AssessmentAction({ a, submission, size = 'sm' }) {
  if (submission) {
    return <Link to={`/student/results/${a.id}`}><Button size={size} variant="secondary" icon={BookOpenCheck}>View</Button></Link>
  }
  if (a.status === 'upcoming') return <Badge tone="info">Opens soon</Badge>
  if (a.status === 'ended') {
    return a.release_questions_after_deadline
      ? <Link to={`/student/paper/${a.id}`}><Button size={size} variant="ghost">Question paper</Button></Link>
      : <Badge>Missed</Badge>
  }
  if (a.assessment_type === 'mixed') {
    return (
      <div className="flex gap-1.5">
        <Link to={takePath('mcq', a.id)}><Button size={size} icon={ListChecks}>MCQ part</Button></Link>
        <Link to={takePath('coding', a.id)}><Button size={size} variant="secondary" icon={Code2}>Coding part</Button></Link>
      </div>
    )
  }
  const icon = { mcq: Play, coding: Code2, manual: PenLine }[a.assessment_type]
  return <Link to={takePath(a.assessment_type, a.id)}><Button size={size} icon={icon}>{a.assessment_type === 'manual' ? 'Upload answers' : 'Start'}</Button></Link>
}
