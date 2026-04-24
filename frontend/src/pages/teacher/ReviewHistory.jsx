import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, User, Lock, CheckCircle } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Badge from '../../components/Badge'
import CodeEditor from '../../components/CodeEditor'

export default function ReviewHistory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const [loading, setLoading] = useState(true)
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await teacherAPI.getSubmission(token, id)
        setSubmission(data)
      } catch (error) {
        console.error('Failed to fetch data:', error)
        addToast('Failed to load submission details', 'error')
        navigate('/teacher/assessments')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, token, addToast, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    )
  }

  if (!submission) return null

  const evaluation = submission.evaluation || {}
  const feedbackData = submission.feedback || {}
  const isFinalized = evaluation.status === 'finalized'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">Submission Details</h1>
          <p className="text-text-secondary mt-1">
            Submission #{submission.submission_id?.slice(-6) || id.slice(-6)}
          </p>
        </div>
        <Badge
          variant={isFinalized ? 'success' : 'primary'}
          className="text-sm px-4 py-1.5 gap-1.5"
        >
          {isFinalized && <Lock className="w-3 h-3" />}
          {isFinalized ? 'Finalized' : evaluation.status || 'In Review'}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Score Summary + Code */}
        <div className="space-y-6">
          {/* Score Summary */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Score Summary</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-background rounded-xl text-center">
                <p className="text-2xl font-bold text-primary">{evaluation.ai_score ?? '-'}</p>
                <p className="text-sm text-text-secondary">AI Score</p>
              </div>
              <div className="p-4 bg-background rounded-xl text-center">
                <p className="text-2xl font-bold text-success">{evaluation.final_score ?? '-'}</p>
                <p className="text-sm text-text-secondary">Final Score</p>
              </div>
              <div className="p-4 bg-background rounded-xl text-center">
                <p className="text-2xl font-bold text-text-primary">{evaluation.max_marks ?? '-'}</p>
                <p className="text-sm text-text-secondary">Max Marks</p>
              </div>
            </div>
            {evaluation.accuracy_score > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-text-secondary">Accuracy Score</span>
                  <span className="font-medium text-text-primary">{evaluation.accuracy_score}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(evaluation.accuracy_score, 100)}%` }} />
                </div>
              </div>
            )}
          </Card>

          {/* Student Code */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Student Code</h2>
            <CodeEditor
              value={submission.code || '// No code submitted'}
              readOnly
              language={submission.language || 'python'}
              height="300px"
            />
          </Card>
        </div>

        {/* Right: Feedback */}
        <div className="space-y-6">
          {/* Teacher Feedback */}
          {feedbackData.teacher_feedback && (
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
                <User className="w-5 h-5 text-success" />
                Teacher Feedback
              </h2>
              <p className="text-text-primary whitespace-pre-wrap bg-background p-4 rounded-xl">
                {feedbackData.teacher_feedback}
              </p>
            </Card>
          )}

          {/* AI Feedback */}
          {feedbackData.ai_feedback && (
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
                <Bot className="w-5 h-5 text-primary" />
                AI Feedback
              </h2>
              <p className="text-text-primary whitespace-pre-wrap bg-background p-4 rounded-xl">
                {feedbackData.ai_feedback}
              </p>
            </Card>
          )}

          {/* Status */}
          {isFinalized && (
            <Card>
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-success">Submission Finalized</h3>
                <p className="text-text-secondary mt-1">
                  Final score: <span className="font-bold text-success">{evaluation.final_score ?? evaluation.ai_score}</span>
                  /{evaluation.max_marks || '-'}
                </p>
              </div>
            </Card>
          )}

          {/* Edit button for non-finalized */}
          {!isFinalized && (
            <Button 
              className="w-full" 
              onClick={() => navigate(`/teacher/submissions/${id}/review`)}
            >
              Edit Review
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
