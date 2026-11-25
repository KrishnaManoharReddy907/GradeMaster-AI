import { Link } from 'react-router-dom'
import { BookOpenCheck, Code2, PenLine, Play } from 'lucide-react'
import { Badge, Button } from '@/components/ui'

export const takePath = (type, id) => ({ mcq: `/student/take/mcq/${id}`, coding: `/student/take/coding/${id}`, manual: `/student/take/handwritten/${id}`, mixed: `/student/take/mixed/${id}` }[type])

/** The right call-to-action for an assessment row given its status and the student's submission. */
export function AssessmentAction({ a, submission, size = 'sm' }) {
  if (submission && (submission.complete !== false || a.status !== 'active')) {
    return <Link to={`/student/results/${a.id}`}><Button size={size} variant="secondary" icon={BookOpenCheck}>View</Button></Link>
  }
  if (submission) {
    // Part of the assessment is still unsubmitted and the window is open.
    return <Link to={takePath(a.assessment_type, a.id)}><Button size={size} icon={Play}>Continue</Button></Link>
  }
  if (a.status === 'upcoming') return <Badge tone="info">Opens soon</Badge>
  if (a.status === 'ended') {
    return a.release_questions_after_deadline
      ? <Link to={`/student/paper/${a.id}`}><Button size={size} variant="ghost">Question paper</Button></Link>
      : <Badge>Missed</Badge>
  }
  const icon = { mcq: Play, coding: Code2, manual: PenLine, mixed: Play }[a.assessment_type]
  return <Link to={takePath(a.assessment_type, a.id)}><Button size={size} icon={icon}>{a.assessment_type === 'manual' ? 'Upload answers' : 'Start'}</Button></Link>
}
