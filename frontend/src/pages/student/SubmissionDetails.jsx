import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, Clock, Code, FileQuestion, Bot, User, Shield, Bug, Lightbulb, TestTube, PenLine, Award, MessageSquare } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Badge from '../../components/Badge'
import CodeEditor from '../../components/CodeEditor'

const statusConfig = {
  pending: { variant: 'warning', label: 'Pending Review', icon: Clock },
  submitted: { variant: 'primary', label: 'Submitted', icon: CheckCircle },
  evaluated: { variant: 'primary', label: 'AI Evaluated', icon: CheckCircle },
  reviewed: { variant: 'success', label: 'Reviewed', icon: CheckCircle },
  finalized: { variant: 'success', label: 'Finalized', icon: CheckCircle },
  failed: { variant: 'error', label: 'Failed', icon: XCircle },
}

export default function SubmissionDetails() {
  // The id here is the assessment_id (passed from SubmissionStatus page)
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState(null)
  const [submissionStatus, setSubmissionStatus] = useState(null)
  const [manualDetail, setManualDetail] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [assessmentList, statusData] = await Promise.all([
          studentAPI.getAssessments(token),
          studentAPI.getSubmissionStatus(token, id),
        ])
        
        const list = Array.isArray(assessmentList) ? assessmentList : assessmentList.assessments || []
        const found = list.find(a => String(a.id) === String(id))
        
        setAssessment(found || { title: 'Assessment', assessment_type: 'unknown' })
        setSubmissionStatus(statusData)

        // If manual submitted, fetch detailed results
        if (statusData.manual_submitted) {
          try {
            const detail = await studentAPI.getManualSubmissionDetail(token, id)
            setManualDetail(detail)
          } catch {
            // Detail may not be available yet
          }
        }
      } catch (error) {
        console.error('Failed to fetch submission details:', error)
        addToast('Failed to load submission details', 'error')
        navigate('/student/submissions')
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

  if (!submissionStatus) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/student/submissions')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">
            {assessment?.title || 'Submission Details'}
          </h1>
          <p className="text-text-secondary mt-1">
            {(assessment?.assessment_type || 'unknown') === 'mcq' ? 'MCQ' : 
             (assessment?.assessment_type || 'unknown') === 'coding' ? 'Coding' :
             (assessment?.assessment_type || 'unknown') === 'manual' ? 'Handwritten' : 'Mixed'} Assessment
          </p>
        </div>
      </div>

      {/* MCQ Results */}
      {submissionStatus.mcq_submitted && (
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileQuestion className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">MCQ Results</h2>
              <Badge variant="success" className="mt-1">Auto-Evaluated</Badge>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-primary">{submissionStatus.mcq_score ?? '-'}</p>
              <p className="text-sm text-text-secondary mt-1">Score</p>
            </div>
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-text-primary">{submissionStatus.mcq_total ?? '-'}</p>
              <p className="text-sm text-text-secondary mt-1">Total Marks</p>
            </div>
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-success">
                {submissionStatus.mcq_percentage != null 
                  ? `${Math.round(submissionStatus.mcq_percentage)}%`
                  : submissionStatus.mcq_score != null && submissionStatus.mcq_total 
                    ? `${Math.round((submissionStatus.mcq_score / submissionStatus.mcq_total) * 100)}%`
                    : '-'}
              </p>
              <p className="text-sm text-text-secondary mt-1">Percentage</p>
            </div>
          </div>
        </Card>
      )}

      {/* Coding Results — Full detail per question */}
      {submissionStatus.coding_submitted && submissionStatus.coding_submissions?.map((sub, index) => {
        const subStatus = sub.status || 'pending'
        const config = statusConfig[subStatus] || statusConfig.pending
        const StatusIcon = config.icon
        const resultSummary = sub.result_summary || {}
        const aiInsights = sub.ai_insights || {}
        const analysis = sub.analysis || {}
        const issues = sub.issues || {}
        const plagiarism = analysis.plagiarism || {}
        
        // Determine the displayed score: teacher final_score overrides AI score
        const displayScore = sub.final_score ?? sub.ai_score
        const scoreLabel = sub.final_score != null ? 'Final Score (Teacher)' : 'AI Score'

        return (
          <div key={sub.question_id || index} className="space-y-4">
            {/* Question header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Code className="w-5 h-5 text-success" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary">
                  Coding Question {index + 1}
                </h2>
                <p className="text-xs text-text-secondary">
                  {sub.language || 'Unknown'} • {subStatus}
                </p>
              </div>
              <Badge variant={config.variant} className="gap-1.5">
                <StatusIcon className="w-3 h-3" />
                {config.label}
              </Badge>
            </div>

            {/* Score Summary */}
            <Card>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary mb-4">
                <Bot className="w-5 h-5 text-primary" />
                Evaluation Results
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-background rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{displayScore ?? '-'}</p>
                  <p className="text-xs text-text-secondary">{scoreLabel}</p>
                </div>
                <div className="bg-background rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-text-primary">{sub.max_marks ?? '-'}</p>
                  <p className="text-xs text-text-secondary">Max Marks</p>
                </div>
                <div className="bg-background rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-text-primary">
                    {sub.passed_tests ?? resultSummary.passed ?? '-'}/{sub.total_tests ?? resultSummary.total ?? '-'}
                  </p>
                  <p className="text-xs text-text-secondary">Tests Passed</p>
                </div>
                <div className="bg-background rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${
                    (plagiarism.score || 0) > 50 ? 'text-error' : 
                    (plagiarism.score || 0) > 20 ? 'text-warning' : 'text-success'
                  }`}>
                    {plagiarism.score ?? 0}%
                  </p>
                  <p className="text-xs text-text-secondary">Plagiarism</p>
                </div>
              </div>

              {/* Confidence */}
              {resultSummary.accuracy_score > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-text-secondary">Accuracy Score</span>
                    <span className="font-medium text-text-primary">{resultSummary.accuracy_score}%</span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(resultSummary.accuracy_score, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* AI Feedback */}
            {(aiInsights.feedback || resultSummary.feedback) && (
              <Card>
                <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary mb-3">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  AI Feedback
                </h3>
                <div className="text-sm text-text-primary whitespace-pre-wrap bg-background p-4 rounded-xl">
                  {aiInsights.feedback || resultSummary.feedback}
                </div>
              </Card>
            )}

            {/* Teacher Feedback */}
            {sub.teacher_feedback && (
              <Card>
                <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary mb-3">
                  <User className="w-5 h-5 text-success" />
                  Teacher Feedback
                </h3>
                <div className="text-sm text-text-primary whitespace-pre-wrap bg-background p-4 rounded-xl">
                  {sub.teacher_feedback}
                </div>
              </Card>
            )}

            {/* Test Results */}
            {issues.test_results && issues.test_results.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                    <TestTube className="w-5 h-5 text-primary" />
                    Test Results
                  </h3>
                  <Badge variant={sub.passed_tests === sub.total_tests ? 'success' : 'warning'}>
                    {sub.passed_tests || 0}/{sub.total_tests || 0} passed
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {issues.test_results.map((test, tIndex) => (
                    <div
                      key={tIndex}
                      className={`p-3 rounded-lg ${test.passed ? 'bg-success/10' : 'bg-error/10'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-text-primary">
                          Test Case {tIndex + 1}
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
                      {!test.is_hidden && (
                        <div className="mt-2 space-y-1 text-xs">
                          {test.input !== undefined && (
                            <div><span className="text-text-secondary">Input: </span><code className="text-text-primary">{test.input}</code></div>
                          )}
                          {test.expected_output !== undefined && (
                            <div><span className="text-text-secondary">Expected: </span><code className="text-success">{test.expected_output}</code></div>
                          )}
                          {test.actual_output !== undefined && (
                            <div><span className="text-text-secondary">Actual: </span><code className={test.passed ? 'text-success' : 'text-error'}>{test.actual_output}</code></div>
                          )}
                          {test.stderr && (
                            <div><span className="text-text-secondary">Error: </span><code className="text-error">{test.stderr}</code></div>
                          )}
                        </div>
                      )}
                      {test.time && (
                        <div className="mt-1 text-xs text-text-secondary">
                          Time: {test.time}s • Memory: {test.memory}KB
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Suggested Fix */}
            {aiInsights.suggested_fix && Object.keys(aiInsights.suggested_fix).length > 0 && (
              <Card>
                <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary mb-3">
                  <Bug className="w-5 h-5 text-warning" />
                  Suggested Fix
                </h3>
                <div className="text-sm text-text-primary bg-background p-4 rounded-xl whitespace-pre-wrap">
                  {typeof aiInsights.suggested_fix === 'string'
                    ? aiInsights.suggested_fix
                    : aiInsights.suggested_fix.explanation || aiInsights.suggested_fix.description || JSON.stringify(aiInsights.suggested_fix, null, 2)}
                </div>
              </Card>
            )}

            {/* AI Corrected Code */}
            {aiInsights.code_fix && (aiInsights.code_fix.corrected_code || aiInsights.code_fix.fixed_code) && (
              <Card>
                <h3 className="text-base font-semibold text-text-primary mb-3">AI Corrected Code</h3>
                <CodeEditor
                  value={aiInsights.code_fix.corrected_code || aiInsights.code_fix.fixed_code}
                  readOnly
                  language={sub.language || 'python'}
                  height="200px"
                />
              </Card>
            )}

            {/* Student's submitted code */}
            {sub.code && (
              <Card>
                <h3 className="text-base font-semibold text-text-primary mb-3">Your Submitted Code</h3>
                <CodeEditor
                  value={sub.code}
                  readOnly
                  language={sub.language || 'python'}
                  height="200px"
                />
              </Card>
            )}
          </div>
        )
      })}

      {/* Manual Assignment Results */}
      {submissionStatus.manual_submitted && (
        <div className="space-y-4">
          {/* Header with score overview */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <PenLine className="w-5 h-5 text-secondary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary">Handwritten Assignment</h2>
                <Badge variant={submissionStatus.manual_status === 'finalized' ? 'success' : 'warning'} className="mt-1">
                  {submissionStatus.manual_status === 'finalized' ? 'Reviewed' : 'Awaiting Review'}
                </Badge>
              </div>
            </div>

            {submissionStatus.manual_status === 'finalized' && manualDetail ? (
              <div className="space-y-4">
                {/* Score cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-background rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-primary">
                      {manualDetail.final_score ?? '-'}
                    </p>
                    <p className="text-sm text-text-secondary mt-1">Final Score</p>
                  </div>
                  <div className="bg-background rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-text-primary">{manualDetail.total_marks ?? '-'}</p>
                    <p className="text-sm text-text-secondary mt-1">Total Marks</p>
                  </div>
                  <div className="bg-background rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-success">
                      {manualDetail.total_marks && manualDetail.final_score != null
                        ? `${Math.round((manualDetail.final_score / manualDetail.total_marks) * 100)}%`
                        : '-'}
                    </p>
                    <p className="text-sm text-text-secondary mt-1">Percentage</p>
                  </div>
                </div>

                {/* Teacher feedback */}
                {manualDetail.teacher_feedback && (
                  <div className="p-4 bg-success/5 border border-success/10 rounded-xl">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-success mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-success mb-1">Teacher Feedback</p>
                        <p className="text-sm text-text-primary">{manualDetail.teacher_feedback}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-warning mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-text-primary mb-2">Awaiting Teacher Review</h3>
                <p className="text-text-secondary">Your assignment has been submitted. Results will be available after your teacher reviews it.</p>
              </div>
            )}
          </Card>

          {/* Per-question detailed results (only after review) */}
          {submissionStatus.manual_status === 'finalized' && manualDetail?.question_results?.map((q, i) => {
            const scorePct = q.max_marks > 0 ? (q.final_score / q.max_marks) * 100 : 0
            const getScoreColor = (pct) => {
              if (pct >= 80) return 'text-emerald-400'
              if (pct >= 50) return 'text-amber-400'
              return 'text-red-400'
            }
            return (
              <Card key={q.question_id || i}>
                {/* Question header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-secondary">{q.question_id || i + 1}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-text-primary">{q.question_text}</h3>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(scorePct)}`}>
                    {q.final_score} / {q.max_marks}
                  </div>
                </div>

                {/* Student's answer */}
                {q.student_answer && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Your Answer</p>
                    <div className="p-3 bg-surface-light/50 rounded-xl text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                      {q.student_answer}
                    </div>
                  </div>
                )}

                {/* AI Feedback */}
                {q.feedback && (
                  <div className="mb-4 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-primary mb-1">AI Feedback</p>
                        <p className="text-sm text-text-primary">{q.feedback}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Correctness & completeness badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {q.correctness && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                      q.correctness === 'good' ? 'bg-emerald-500/10 text-emerald-400' :
                      q.correctness === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      Correctness: {q.correctness}
                    </span>
                  )}
                  {q.completeness && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                      q.completeness === 'complete' ? 'bg-emerald-500/10 text-emerald-400' :
                      q.completeness === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      Completeness: {q.completeness}
                    </span>
                  )}
                </div>

                {/* Keywords matched / missed */}
                {(q.keywords_matched?.length > 0 || q.keywords_missed?.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Keywords</p>
                    <div className="flex flex-wrap gap-1.5">
                      {q.keywords_matched?.map((kw, j) => (
                        <span key={`m-${j}`} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-lg border border-emerald-500/20">
                          ✓ {kw}
                        </span>
                      ))}
                      {q.keywords_missed?.map((kw, j) => (
                        <span key={`x-${j}`} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20">
                          ✗ {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* No submission data */}
      {!submissionStatus.mcq_submitted && !submissionStatus.coding_submitted && !submissionStatus.manual_submitted && (
        <Card>
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No submission found</h3>
            <p className="text-text-secondary">You haven&apos;t submitted anything for this assessment yet.</p>
          </div>
        </Card>
      )}
    </div>
  )
}
