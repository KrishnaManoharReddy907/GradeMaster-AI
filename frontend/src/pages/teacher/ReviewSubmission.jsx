import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, CheckCircle, XCircle, Send, Shield, Bug, Lightbulb, TestTube, Lock } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input, { Textarea } from '../../components/Input'
import Loader from '../../components/Loader'
import CodeEditor from '../../components/CodeEditor'
import Badge from '../../components/Badge'

export default function ReviewSubmission() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [review, setReview] = useState({
    final_score: '',
    teacher_feedback: '',
  })

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const data = await teacherAPI.getSubmission(token, id)
        setSubmission(data)
        
        const evaluation = data.evaluation || {}
        const feedbackData = data.feedback || {}
        
        if (evaluation.final_score != null) {
          setReview(prev => ({ ...prev, final_score: String(evaluation.final_score) }))
        } else if (evaluation.ai_score != null) {
          setReview(prev => ({ ...prev, final_score: String(evaluation.ai_score) }))
        }
        if (feedbackData.teacher_feedback) {
          setReview(prev => ({ ...prev, teacher_feedback: feedbackData.teacher_feedback }))
        }
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

  const handleSubmitAndFinalize = async () => {
    if (!review.final_score) {
      addToast('Please enter a final score', 'warning')
      return
    }

    setSubmitting(true)
    try {
      // Step 1: Submit review
      await teacherAPI.reviewSubmission(token, id, {
        final_score: parseFloat(review.final_score),
        teacher_feedback: review.teacher_feedback,
      })
      
      // Step 2: Finalize immediately
      await teacherAPI.finalizeSubmission(token, id)
      
      addToast('Review submitted and finalized!', 'success')
      navigate(-1)
    } catch (error) {
      console.error('Review failed:', error)
      addToast(error.message || 'Failed to submit review', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveReview = async () => {
    if (!review.final_score) {
      addToast('Please enter a final score', 'warning')
      return
    }

    setSubmitting(true)
    try {
      await teacherAPI.reviewSubmission(token, id, {
        final_score: parseFloat(review.final_score),
        teacher_feedback: review.teacher_feedback,
      })
      addToast('Review saved (not finalized yet)', 'success')
      
      const data = await teacherAPI.getSubmission(token, id)
      setSubmission(data)
    } catch (error) {
      console.error('Review failed:', error)
      addToast(error.message || 'Failed to save review', 'error')
    } finally {
      setSubmitting(false)
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

  const evaluation = submission.evaluation || {}
  const feedbackData = submission.feedback || {}
  const corrections = submission.corrections || {}
  const analysis = submission.analysis || {}
  const issues = submission.issues || {}
  const plagiarism = analysis.plagiarism || {}
  const ast = analysis.ast || {}
  const isFinalized = evaluation.status === 'finalized'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">Review Submission</h1>
          <p className="text-text-secondary mt-1">
            Submission #{submission.submission_id?.slice(-6) || id.slice(-6)} • {submission.language || 'Unknown'}
          </p>
        </div>
        <Badge variant={
          isFinalized ? 'success' :
          evaluation.status === 'reviewed' ? 'primary' :
          evaluation.status === 'evaluated' ? 'primary' : 'warning'
        }>
          {isFinalized && <Lock className="w-3 h-3 mr-1" />}
          {evaluation.status || 'pending'}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Student Code and Test Results */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Student Code</h2>
            <CodeEditor
              value={submission.code || '// No code submitted'}
              readOnly
              language={submission.language || 'python'}
              height="350px"
            />
          </Card>

          {/* Test Results */}
          {issues.test_results && issues.test_results.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                  <TestTube className="w-5 h-5 text-primary" />
                  Test Results
                </h2>
                <Badge variant={evaluation.passed_tests === evaluation.total_tests ? 'success' : 'warning'}>
                  {evaluation.passed_tests || 0}/{evaluation.total_tests || 0} passed
                </Badge>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {issues.test_results.map((test, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${test.passed ? 'bg-success/10' : 'bg-error/10'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        Test Case {index + 1}
                        {test.is_hidden && <span className="text-xs text-text-secondary ml-2">(Hidden)</span>}
                      </span>
                      <Badge variant={test.passed ? 'success' : 'error'} className="gap-1">
                        {test.passed ? <><CheckCircle className="w-3 h-3" /> Passed</> : <><XCircle className="w-3 h-3" /> Failed</>}
                      </Badge>
                    </div>
                    {!test.is_hidden && (
                      <div className="mt-2 space-y-1 text-xs">
                        {test.input !== undefined && <div><span className="text-text-secondary">Input: </span><code className="text-text-primary">{test.input}</code></div>}
                        {test.expected_output !== undefined && <div><span className="text-text-secondary">Expected: </span><code className="text-success">{test.expected_output}</code></div>}
                        {test.actual_output !== undefined && <div><span className="text-text-secondary">Actual: </span><code className={test.passed ? 'text-success' : 'text-error'}>{test.actual_output}</code></div>}
                        {test.stderr && <div><span className="text-text-secondary">Error: </span><code className="text-error">{test.stderr}</code></div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Bugs */}
          {issues.bugs && issues.bugs.length > 0 && (
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
                <Bug className="w-5 h-5 text-error" />
                Bugs Detected ({issues.bugs.length})
              </h2>
              <div className="space-y-2">
                {issues.bugs.map((bug, index) => (
                  <div key={index} className="p-3 bg-error/10 rounded-lg">
                    <p className="text-sm font-medium text-error">{bug.type || bug.category || 'Bug'}</p>
                    <p className="text-sm text-text-primary mt-1">{bug.description || bug.message || JSON.stringify(bug)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: AI Evaluation + Review Form */}
        <div className="space-y-6">
          {/* AI Evaluation Summary */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Bot className="w-5 h-5 text-primary" />
                AI Evaluation
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
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                  <Lightbulb className="w-4 h-4" /> AI Feedback
                </h3>
                <div className="text-sm text-text-primary whitespace-pre-wrap bg-background p-3 rounded-lg">
                  {feedbackData.ai_feedback}
                </div>
              </div>
            )}

            {corrections.suggested_fix && Object.keys(corrections.suggested_fix).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-text-secondary mb-2">Suggested Fix</h3>
                <div className="text-sm text-text-primary bg-background p-3 rounded-lg whitespace-pre-wrap">
                  {typeof corrections.suggested_fix === 'string' 
                    ? corrections.suggested_fix 
                    : corrections.suggested_fix.explanation || JSON.stringify(corrections.suggested_fix, null, 2)}
                </div>
              </div>
            )}

            {corrections.code_fix && (corrections.code_fix.corrected_code || corrections.code_fix.fixed_code) && (
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">AI Corrected Code</h3>
                <CodeEditor
                  value={corrections.code_fix.corrected_code || corrections.code_fix.fixed_code}
                  readOnly
                  language={submission.language || 'python'}
                  height="200px"
                />
              </div>
            )}
          </Card>

          {/* Plagiarism & Code Analysis */}
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
              <Shield className="w-5 h-5 text-warning" />
              Code Analysis
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-background rounded-xl">
                <p className="text-xs text-text-secondary mb-1">Plagiarism</p>
                <p className={`text-2xl font-bold ${
                  (plagiarism.score || 0) > 50 ? 'text-error' : 
                  (plagiarism.score || 0) > 20 ? 'text-warning' : 'text-success'
                }`}>
                  {plagiarism.score ?? 0}%
                </p>
              </div>
              <div className="p-3 bg-background rounded-xl">
                <p className="text-xs text-text-secondary mb-1">Complexity</p>
                <p className="text-2xl font-bold text-text-primary capitalize">{ast.complexity || '-'}</p>
              </div>
            </div>
          </Card>

          {/* Teacher Review Form */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              {isFinalized ? 'Review (Finalized)' : 'Your Review'}
            </h2>
            <div className="space-y-4">
              <Input
                label="Final Score"
                type="number"
                placeholder={`AI suggested: ${evaluation.ai_score ?? '-'}`}
                value={review.final_score}
                onChange={(e) => setReview({ ...review, final_score: e.target.value })}
                disabled={isFinalized}
              />
              <Textarea
                label="Feedback for Student"
                placeholder="Enter your feedback — the student will see this"
                value={review.teacher_feedback}
                onChange={(e) => setReview({ ...review, teacher_feedback: e.target.value })}
                rows={4}
                disabled={isFinalized}
              />
              {!isFinalized && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={handleSaveReview}
                    loading={submitting}
                  >
                    Save Draft
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmitAndFinalize}
                    loading={submitting}
                  >
                    <Send className="w-4 h-4" />
                    Submit & Finalize
                  </Button>
                </div>
              )}
              {isFinalized && (
                <div className="text-center py-2 bg-success/10 rounded-lg">
                  <p className="text-sm text-success font-medium flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" />
                    This submission is finalized — no further changes allowed
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
