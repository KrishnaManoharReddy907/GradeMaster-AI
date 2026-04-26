import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Clock, CheckCircle, XCircle, Eye } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import Badge from '../../components/Badge'
import { TableSkeleton } from '../../components/Loader'

const statusConfig = {
  pending: { variant: 'warning', label: 'Pending', icon: Clock },
  awaiting_review: { variant: 'warning', label: 'Awaiting Review', icon: Clock },
  submitted: { variant: 'primary', label: 'Submitted', icon: CheckCircle },
  evaluated: { variant: 'primary', label: 'AI Evaluated', icon: CheckCircle },
  reviewed: { variant: 'success', label: 'Reviewed', icon: CheckCircle },
  finalized: { variant: 'success', label: 'Finalized', icon: CheckCircle },
  failed: { variant: 'error', label: 'Failed', icon: XCircle },
}

export default function SubmissionStatus() {
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState([])

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        // Use the new all-submissions endpoint (returns past + present)
        const data = await studentAPI.getAllSubmissions(token)
        const subs = data.submissions || []

        // Map status for manual awaiting review
        const mapped = subs.map(s => {
          let displayStatus = s.status
          if (s.submissionType === 'manual' && s.status !== 'finalized') {
            displayStatus = 'awaiting_review'
          }
          return { ...s, status: displayStatus }
        })

        setSubmissions(mapped)
      } catch (error) {
        console.error('Failed to fetch submissions:', error)
        addToast('Failed to load submissions', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchSubmissions()
  }, [token, addToast])

  const handleViewDetails = (submission) => {
    navigate(`/student/submissions/${submission.assessmentId}`)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Submission Status</h1>
          <p className="text-text-secondary mt-1">Track the status of your submitted assessments</p>
        </div>
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Submission Status</h1>
        <p className="text-text-secondary mt-1">Track the status of your submitted assessments</p>
      </div>

      {submissions.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No submissions yet</h3>
            <p className="text-text-secondary mb-4">Complete an assessment to see your submissions here.</p>
            <Button onClick={() => navigate('/student/assessments')}>
              View Assessments
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission, index) => {
                const status = submission.status || 'pending'
                const config = statusConfig[status] || statusConfig.pending
                const StatusIcon = config.icon
                const score = submission.score
                const totalMarks = submission.total_marks
                
                return (
                  <TableRow key={submission.assessmentId || index}>
                    <TableCell>
                      <span className="font-medium">
                        {submission.assessmentTitle || 'Assessment'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {submission.assessmentType === 'mcq' ? 'MCQ' : 
                         submission.assessmentType === 'coding' ? 'Coding' :
                         submission.assessmentType === 'manual' ? 'Handwritten' : 'Mixed'}
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
                          {score}{totalMarks ? `/${totalMarks}` : ''}
                        </span>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(submission)}
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
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
