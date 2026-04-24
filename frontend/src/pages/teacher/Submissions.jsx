import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle, XCircle, Eye, Play, Bot, User } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import Badge from '../../components/Badge'
import Loader, { TableSkeleton } from '../../components/Loader'

const statusConfig = {
  pending: { variant: 'warning', label: 'Pending', icon: Clock },
  evaluated: { variant: 'primary', label: 'AI Evaluated', icon: Bot },
  reviewed: { variant: 'success', label: 'Reviewed', icon: CheckCircle },
  finalized: { variant: 'success', label: 'Finalized', icon: CheckCircle },
  failed: { variant: 'error', label: 'Failed', icon: XCircle },
}

export default function Submissions() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState({})
  const [assessment, setAssessment] = useState(null)
  const [submissions, setSubmissions] = useState([])

  const fetchData = async () => {
    try {
      // Fetch assessment details and submissions in parallel
      const [assessmentData, submissionsData] = await Promise.all([
        teacherAPI.getAssessment(token, id),
        teacherAPI.getAssessmentSubmissions(token, id),
      ])
      setAssessment(assessmentData)
      setSubmissions(submissionsData.submissions || [])
    } catch (error) {
      console.error('Failed to fetch assessment:', error)
      addToast('Failed to load assessment', 'error')
      navigate('/teacher/assessments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id, token])

  const handleEvaluate = async (submissionId) => {
    setEvaluating(prev => ({ ...prev, [submissionId]: true }))
    try {
      await teacherAPI.evaluateSubmission(token, submissionId)
      addToast('AI evaluation started', 'success')
      // Refresh submissions
      const submissionsData = await teacherAPI.getAssessmentSubmissions(token, id)
      setSubmissions(submissionsData.submissions || [])
    } catch (error) {
      console.error('Evaluation failed:', error)
      addToast(error.message || 'Failed to evaluate submission', 'error')
    } finally {
      setEvaluating(prev => ({ ...prev, [submissionId]: false }))
    }
  }

  const handleBatchEvaluate = async () => {
    setEvaluating(prev => ({ ...prev, batch: true }))
    try {
      await teacherAPI.evaluateAssessment(token, id)
      addToast('Batch AI evaluation started', 'success')
      // Refresh submissions
      const submissionsData = await teacherAPI.getAssessmentSubmissions(token, id)
      setSubmissions(submissionsData.submissions || [])
    } catch (error) {
      console.error('Batch evaluation failed:', error)
      addToast(error.message || 'Failed to start batch evaluation', 'error')
    } finally {
      setEvaluating(prev => ({ ...prev, batch: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/teacher/assessments')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">{assessment?.title}</h1>
          <p className="text-text-secondary mt-1">
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={handleBatchEvaluate} loading={evaluating.batch}>
          <Bot className="w-5 h-5" />
          Evaluate All with AI
        </Button>
      </div>

      {/* Submissions Table */}
      {submissions.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-text-secondary">
            <User className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No submissions yet</h3>
            <p>Students haven&apos;t submitted any work for this assessment.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => {
                const status = submission.status || 'pending'
                const config = statusConfig[status] || statusConfig.pending
                const StatusIcon = config.icon
                const score = submission.final_score ?? submission.ai_score ?? submission.score
                const maxMarks = submission.total_marks ?? submission.max_marks
                
                return (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{submission.student_name || 'Student'}</span>
                        {submission.student_email && (
                          <p className="text-xs text-text-secondary">{submission.student_email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {submission.type === 'mcq' ? 'MCQ' : 'Coding'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant} className="gap-1.5">
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {score !== undefined && score !== null ? (
                        <span className="text-primary font-medium">
                          {score}{maxMarks ? `/${maxMarks}` : ''}
                        </span>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">
                        {submission.submitted_at 
                          ? new Date(submission.submitted_at).toLocaleDateString() 
                          : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEvaluate(submission.id)}
                            loading={evaluating[submission.id]}
                            title="Run AI evaluation"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {(status === 'evaluated' || status === 'pending') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/teacher/submissions/${submission.id}/review`)}
                            title="Review submission"
                          >
                            <Eye className="w-4 h-4" />
                            Review
                          </Button>
                        )}
                        {(status === 'reviewed' || status === 'finalized') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/teacher/submissions/${submission.id}/history`)}
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
