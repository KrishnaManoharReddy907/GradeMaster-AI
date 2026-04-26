import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Target, Award, Send, Loader2 } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import Button from '../../components/Button'
import Input, { Textarea } from '../../components/Input'

export default function ManualReview() {
  const { id: submissionId } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [adjustedScore, setAdjustedScore] = useState('')
  const [teacherFeedback, setTeacherFeedback] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await teacherAPI.getManualSubmission(token, submissionId)
        setSubmission(data)
        if (data.teacher_adjusted_score !== null && data.teacher_adjusted_score !== undefined) {
          setAdjustedScore(data.teacher_adjusted_score)
        }
        if (data.teacher_feedback) setTeacherFeedback(data.teacher_feedback)
      } catch (err) {
        addToast('Failed to load submission', 'error')
        navigate(-1)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token, submissionId])

  const handleSubmitReview = async () => {
    if (adjustedScore === '' || adjustedScore === null) {
      addToast('Please enter an adjusted score', 'warning')
      return
    }
    setSubmitting(true)
    try {
      await teacherAPI.reviewManualSubmission(token, submissionId, {
        teacher_adjusted_score: parseFloat(adjustedScore),
        teacher_feedback: teacherFeedback,
      })
      addToast('Review submitted successfully!', 'success')
      navigate(-1)
    } catch (err) {
      addToast(err.message || 'Failed to submit review', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const getScoreColor = (pct) => {
    if (pct >= 80) return 'text-emerald-400'
    if (pct >= 60) return 'text-amber-400'
    return 'text-red-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!submission) return null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-light rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">Manual Submission Review</h1>
          <p className="text-text-secondary text-sm mt-1">
            {submission.student_name} • {submission.student_email}
          </p>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(submission.percentage)}`}>
          {submission.total_score} / {submission.total_marks}
          <span className="text-sm text-text-secondary ml-2">({submission.percentage}%)</span>
        </div>
      </div>

      {/* Per-Question Review - Split Layout */}
      {submission.results?.map((r, i) => {
        const questionAnswer = submission.student_answers?.[r.question_id] || 'No answer provided'
        return (
          <div key={i} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Student Answer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-secondary">{r.question_id}</span>
                  </div>
                  Student Answer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-surface-light/50 rounded-xl text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                  {questionAnswer}
                </div>
              </CardContent>
            </Card>

            {/* RIGHT: AI Evaluation */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary" />
                    AI Evaluation
                  </CardTitle>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor((r.final_score / r.max_marks) * 100)}`}>
                    {r.final_score} / {r.max_marks}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Scores */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-surface-light/50 rounded-xl">
                    <p className="text-xs text-text-secondary mb-1">Keyword Score</p>
                    <p className="text-lg font-semibold text-text-primary">{r.keyword_score}</p>
                  </div>
                  <div className="p-3 bg-surface-light/50 rounded-xl">
                    <p className="text-xs text-text-secondary mb-1">AI Score</p>
                    <p className="text-lg font-semibold text-text-primary">{r.ai_score}</p>
                  </div>
                </div>

                {/* Feedback */}
                {r.feedback && (
                  <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm text-text-primary">{r.feedback}</p>
                    </div>
                  </div>
                )}

                {/* Keywords */}
                {(r.keywords_matched?.length > 0 || r.keywords_missed?.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Keywords</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.keywords_matched?.map((kw, j) => (
                        <span key={`m-${j}`} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-lg border border-emerald-500/20">
                          ✓ {kw}
                        </span>
                      ))}
                      {r.keywords_missed?.map((kw, j) => (
                        <span key={`x-${j}`} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20">
                          ✗ {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Correctness badges */}
                <div className="flex gap-2">
                  {r.correctness && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                      r.correctness === 'good' ? 'bg-emerald-500/10 text-emerald-400' :
                      r.correctness === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      Correctness: {r.correctness}
                    </span>
                  )}
                  {r.completeness && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                      r.completeness === 'complete' ? 'bg-emerald-500/10 text-emerald-400' :
                      r.completeness === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      Completeness: {r.completeness}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}

      {/* Teacher Review Section */}
      {submission.status === 'finalized' ? (
        /* Read-only: Already finalized */
        <Card className="border border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Review Finalized
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full ml-2">✓ Complete</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-primary">Final Score (Teacher Adjusted)</label>
                <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-lg">
                  {submission.teacher_adjusted_score} / {submission.total_marks}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-primary">AI Score (auto)</label>
                <div className="px-4 py-2.5 rounded-xl bg-surface-light border border-border text-text-secondary">
                  {submission.total_score} / {submission.total_marks} ({submission.percentage}%)
                </div>
              </div>
            </div>
            {submission.teacher_feedback && (
              <div className="p-4 bg-surface-light/50 rounded-xl border border-border/30">
                <p className="text-xs font-medium text-text-secondary mb-1 uppercase tracking-wider">Teacher Feedback</p>
                <p className="text-sm text-text-primary">{submission.teacher_feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Editable: Not yet reviewed */
        <Card className="border border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Teacher Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={`Final Score (AI suggests: ${submission.total_score}/${submission.total_marks})`}
                type="number"
                min="0"
                max={submission.total_marks}
                step="0.5"
                value={adjustedScore}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setAdjustedScore(e.target.value)}
                placeholder={`e.g., ${submission.total_score}`}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-primary">AI Score (auto)</label>
                <div className="px-4 py-2.5 rounded-xl bg-surface-light border border-border text-text-secondary">
                  {submission.total_score} / {submission.total_marks} ({submission.percentage}%)
                </div>
              </div>
            </div>
            <Textarea
              label="Teacher Feedback (optional)"
              placeholder="Add your feedback or notes..."
              value={teacherFeedback}
              onChange={(e) => setTeacherFeedback(e.target.value)}
              rows={3}
            />
            <Button onClick={handleSubmitReview} loading={submitting} className="w-full">
              <Send className="w-4 h-4" />
              Submit & Finalize Review
            </Button>
            <p className="text-xs text-text-secondary text-center">⚠️ This action is final and cannot be changed after submission.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
