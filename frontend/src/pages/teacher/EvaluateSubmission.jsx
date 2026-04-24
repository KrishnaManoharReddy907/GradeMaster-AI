import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Play, CheckCircle, XCircle, Shield } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import CodeEditor from '../../components/CodeEditor'
import Badge from '../../components/Badge'

export default function EvaluateSubmission() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const data = await teacherAPI.getSubmission(token, id)
        setSubmission(data)
      } catch (error) {
        console.error('Failed to fetch submission:', error)
        addToast('Failed to load submission', 'error')
        navigate('/teacher/assessments')
      } finally {
        setLoading(false)
      }
    }

    fetchSubmission()
  }, [id, token, addToast, navigate])

  const handleEvaluate = async () => {
    setEvaluating(true)
    try {
      await teacherAPI.evaluateSubmission(token, id)
      addToast('AI evaluation completed', 'success')
      
      // Refresh submission data
      const data = await teacherAPI.getSubmission(token, id)
      setSubmission(data)
    } catch (error) {
      console.error('Evaluation failed:', error)
      addToast(error.message || 'Evaluation failed', 'error')
    } finally {
      setEvaluating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    )
  }

  if (!submission) return null

  // Use the structured backend response format
  const evaluation = submission.evaluation || {}
  const feedbackData = submission.feedback || {}
  const analysis = submission.analysis || {}
  const issues = submission.issues || {}
  const corrections = submission.corrections || {}
  const plagiarism = analysis.plagiarism || {}
  const isEvaluated = evaluation.status !== 'pending'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">Evaluate Submission</h1>
          <p className="text-text-secondary mt-1">
            Submission #{submission.submission_id?.slice(-6) || id.slice(-6)} • {submission.language || 'Unknown'}
          </p>
        </div>
        {!isEvaluated && (
          <Button onClick={handleEvaluate} loading={evaluating}>
            <Play className="w-5 h-5" />
            Run AI Evaluation
          </Button>
        )}
        {isEvaluated && (
          <Button onClick={() => navigate(`/teacher/submissions/${id}/review`)}>
            Continue to Review
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Student Code */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Student Code</h2>
            <CodeEditor
              value={submission.code || '// No code submitted'}
              readOnly
              language={submission.language || 'python'}
              height="400px"
            />
          </Card>

          {/* Test Results */}
          {isEvaluated && issues.test_results && issues.test_results.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Test Results</h2>
                <Badge variant={evaluation.passed_tests === evaluation.total_tests ? 'success' : 'warning'}>
                  {evaluation.passed_tests || 0}/{evaluation.total_tests || 0} passed
                </Badge>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {issues.test_results.map((test, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      test.passed ? 'bg-success/10' : 'bg-error/10'
                    }`}
                  >
                    <span className="text-sm text-text-primary">
                      Test Case {index + 1}
                      {test.is_hidden && <span className="text-xs text-text-secondary ml-2">(Hidden)</span>}
                    </span>
                    <Badge variant={test.passed ? 'success' : 'error'} className="gap-1">
                      {test.passed ? (
                        <><CheckCircle className="w-3 h-3" /> Passed</>
                      ) : (
                        <><XCircle className="w-3 h-3" /> Failed</>
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Results */}
        <div className="space-y-6">
          {isEvaluated ? (
            <>
              {/* AI Score Summary */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                    <Bot className="w-5 h-5 text-primary" />
                    AI Evaluation Results
                  </h2>
                  {evaluation.accuracy_score > 0 && (
                    <Badge variant="default">{evaluation.accuracy_score}% accuracy</Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 bg-background rounded-xl text-center">
                    <p className="text-2xl font-bold text-primary">{evaluation.ai_score ?? '-'}</p>
                    <p className="text-xs text-text-secondary">AI Score</p>
                  </div>
                  <div className="p-3 bg-background rounded-xl text-center">
                    <p className="text-2xl font-bold text-text-primary">{evaluation.max_marks ?? '-'}</p>
                    <p className="text-xs text-text-secondary">Max Marks</p>
                  </div>
                  <div className="p-3 bg-background rounded-xl text-center">
                    <p className={`text-2xl font-bold ${
                      evaluation.result_status === 'correct' ? 'text-success' :
                      evaluation.result_status === 'partial' ? 'text-warning' : 'text-error'
                    }`}>
                      {evaluation.result_status === 'correct' ? '✓' :
                       evaluation.result_status === 'partial' ? '~' : '✗'}
                    </p>
                    <p className="text-xs text-text-secondary capitalize">{evaluation.result_status || '-'}</p>
                  </div>
                </div>

                {feedbackData.ai_feedback && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-text-secondary mb-2">AI Feedback</h3>
                    <p className="text-sm text-text-primary whitespace-pre-wrap bg-background p-3 rounded-lg">
                      {feedbackData.ai_feedback}
                    </p>
                  </div>
                )}
              </Card>

              {/* Plagiarism */}
              <Card>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
                  <Shield className="w-5 h-5 text-warning" />
                  Plagiarism Check
                </h2>
                <div className="p-3 bg-background rounded-xl">
                  <p className="text-xs text-text-secondary mb-1">Plagiarism Score</p>
                  <p className={`text-2xl font-bold ${
                    (plagiarism.score || 0) > 50 ? 'text-error' : 
                    (plagiarism.score || 0) > 20 ? 'text-warning' : 'text-success'
                  }`}>
                    {plagiarism.score ?? 0}%
                  </p>
                  {plagiarism.similar_submission_id && (
                    <p className="text-xs text-text-secondary mt-1">
                      Similar to submission: #{plagiarism.similar_submission_id.slice(-6)}
                    </p>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <div className="text-center py-12">
                <Bot className="w-16 h-16 text-text-secondary mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  Not Yet Evaluated
                </h3>
                <p className="text-text-secondary mb-4">
                  Click &quot;Run AI Evaluation&quot; to automatically evaluate this submission
                </p>
                <Button onClick={handleEvaluate} loading={evaluating}>
                  <Play className="w-5 h-5" />
                  Run AI Evaluation
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
