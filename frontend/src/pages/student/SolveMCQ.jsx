import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, Bookmark, X, Send, RotateCcw, Eye, EyeOff } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Loader from '../../components/Loader'

// Question states
const Q_NOT_VISITED = 'not-visited'
const Q_VISITED = 'visited'
const Q_ANSWERED = 'answered'
const Q_REVIEW = 'review'

export default function SolveMCQ() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [assessment, setAssessment] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState({})          // { qId: optionId }
  const [questionStates, setQuestionStates] = useState({}) // { qId: state }
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showPalette, setShowPalette] = useState(true) // mobile toggle
  const [timeLeft, setTimeLeft] = useState(null) // seconds
  const timerRef = useRef(null)
  const deadlineRef = useRef(null) // absolute deadline timestamp (ms)
  const stateLoaded = useRef(false) // track if we've restored from storage

  const STORAGE_KEY = `mcq_state_${id}`
  const TIMER_KEY = `mcq_start_${id}`

  // Save exam state to localStorage on every change
  useEffect(() => {
    if (!stateLoaded.current) return // don't save until we've loaded first
    const state = {
      answers,
      questionStates,
      currentQuestion,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [answers, questionStates, currentQuestion, STORAGE_KEY])

  // Fetch assessment
  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const data = await studentAPI.getAssessmentDetail(token, id)
        setAssessment(data)

        const questions = data.mcq_questions || data.questions || []

        // Try to restore saved state from localStorage
        const savedState = localStorage.getItem(STORAGE_KEY)
        if (savedState) {
          try {
            const parsed = JSON.parse(savedState)
            if (parsed.answers) setAnswers(parsed.answers)
            if (parsed.questionStates) setQuestionStates(parsed.questionStates)
            if (typeof parsed.currentQuestion === 'number') setCurrentQuestion(parsed.currentQuestion)
            stateLoaded.current = true
          } catch {
            // Corrupted — initialize fresh
            stateLoaded.current = true
          }
        }

        // If no saved state, initialize fresh
        if (!savedState) {
          const states = {}
          questions.forEach((q, i) => {
            const qId = q.question_id || String(i)
            states[qId] = i === 0 ? Q_VISITED : Q_NOT_VISITED
          })
          setQuestionStates(states)
          stateLoaded.current = true
        }

        // Initialize timer with localStorage persistence
        const duration = data.duration_minutes || data.duration
        if (duration) {
          let startTime = localStorage.getItem(TIMER_KEY)

          if (!startTime) {
            // First time starting this exam — record start time
            startTime = Date.now()
            localStorage.setItem(TIMER_KEY, String(startTime))
          } else {
            startTime = parseInt(startTime, 10)
          }

          // Compute deadline and remaining time
          const deadline = startTime + duration * 60 * 1000
          deadlineRef.current = deadline
          const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
          setTimeLeft(remaining)
        }
      } catch (error) {
        console.error('Failed to fetch assessment:', error)
        addToast(error.message || 'Failed to load assessment', 'error')
        navigate('/student/assessments')
      } finally {
        setLoading(false)
      }
    }
    fetchAssessment()
  }, [id, token, addToast, navigate])

  // Timer countdown — recomputes from deadline every second (drift-proof)
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return

    timerRef.current = setInterval(() => {
      if (deadlineRef.current) {
        const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
        setTimeLeft(remaining)
      } else {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [timeLeft !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && !submitting) {
      addToast('Time is up! Auto-submitting your answers...', 'warning')
      handleSubmitFinal()
    }
  }, [timeLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const questions = assessment?.mcq_questions || assessment?.questions || []
  const totalQuestions = questions.length

  const getQuestionId = (index) => {
    const q = questions[index]
    return q?.question_id || String(index)
  }

  // Mark question as visited when navigating to it
  const goToQuestion = useCallback((index) => {
    if (index < 0 || index >= totalQuestions) return
    setCurrentQuestion(index)
    const qId = questions[index]?.question_id || String(index)
    setQuestionStates(prev => {
      if (prev[qId] === Q_NOT_VISITED) {
        return { ...prev, [qId]: Q_VISITED }
      }
      return prev
    })
  }, [totalQuestions, questions])

  const handleAnswerSelect = (questionId, optionId) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }))
    setQuestionStates(prev => ({ ...prev, [questionId]: Q_ANSWERED }))
  }

  const handleClearResponse = () => {
    const qId = getQuestionId(currentQuestion)
    setAnswers(prev => {
      const next = { ...prev }
      delete next[qId]
      return next
    })
    setQuestionStates(prev => ({ ...prev, [qId]: Q_VISITED }))
  }

  const handleSaveAndNext = () => {
    // Save is implicit (answer is already stored), just move forward
    if (currentQuestion < totalQuestions - 1) {
      goToQuestion(currentQuestion + 1)
    }
  }

  const handleMarkForReview = () => {
    const qId = getQuestionId(currentQuestion)
    if (questionStates[qId] === Q_REVIEW) {
      // Unmark — restore to answered or visited
      setQuestionStates(prev => ({ ...prev, [qId]: answers[qId] ? Q_ANSWERED : Q_VISITED }))
    } else {
      // Mark for review and go next
      setQuestionStates(prev => ({ ...prev, [qId]: Q_REVIEW }))
      if (currentQuestion < totalQuestions - 1) {
        goToQuestion(currentQuestion + 1)
      }
    }
  }

  const handleSubmitFinal = async () => {
    setShowConfirmModal(false)
    if (Object.keys(answers).length === 0) {
      addToast('Please answer at least one question', 'warning')
      return
    }

    setSubmitting(true)
    clearInterval(timerRef.current)

    try {
      const answersPayload = Object.entries(answers).map(([questionId, selectedOptionId]) => ({
        question_id: questionId,
        selected_option_id: selectedOptionId,
      }))

      await studentAPI.submitMCQ(token, {
        assessment_id: id,
        answers: answersPayload,
      })
      // Clean up all exam state from localStorage
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TIMER_KEY)
      addToast('Assessment submitted successfully!', 'success')
      navigate('/student/submissions')
    } catch (error) {
      console.error('Failed to submit MCQ:', error)
      addToast(error.message || 'Failed to submit assessment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Compute stats
  const answeredCount = Object.values(questionStates).filter(s => s === Q_ANSWERED).length
  const reviewCount = Object.values(questionStates).filter(s => s === Q_REVIEW).length
  const visitedCount = Object.values(questionStates).filter(s => s === Q_VISITED).length
  const notVisitedCount = Object.values(questionStates).filter(s => s === Q_NOT_VISITED).length

  // Format timer
  const formatTime = (seconds) => {
    if (seconds === null) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const isCriticalTime = timeLeft !== null && timeLeft <= 300 // < 5 min

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    )
  }

  if (submitting) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center space-y-6 max-w-sm px-6">
          {/* Animated spinner */}
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-surface-light"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-secondary animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Submitting Your Answers</h2>
            <p className="text-text-secondary text-sm">Please wait while we evaluate your responses...</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-text-secondary">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span>AI is grading your answers</span>
          </div>
        </div>
      </div>
    )
  }

  if (!assessment || totalQuestions === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <AlertTriangle className="w-16 h-16 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-text-primary mb-2">No Questions Available</h2>
        <p className="text-text-secondary mb-6">This assessment has no MCQ questions.</p>
        <button
          onClick={() => navigate('/student/assessments')}
          className="px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors"
        >
          Back to Assessments
        </button>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const currentQId = getQuestionId(currentQuestion)
  const qText = currentQ.question_text || currentQ.text || currentQ.question
  const qOptions = currentQ.options || []

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden">
      {/* ─── Sticky Header ─── */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to leave? Your progress will be lost.')) {
                clearInterval(timerRef.current)
                navigate('/student/assessments')
              }
            }}
            className="p-2 rounded-lg hover:bg-background transition-colors text-text-secondary shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-text-primary truncate">{assessment.title}</h1>
            <p className="text-xs text-text-secondary">MCQ Assessment • {totalQuestions} Questions</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Timer */}
          {timeLeft !== null && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${
              isCriticalTime
                ? 'bg-danger/10 exam-timer-critical'
                : 'bg-primary/10 text-primary'
            }`}>
              <Clock className="w-5 h-5" />
              {formatTime(timeLeft)}
            </div>
          )}

          {/* Mobile palette toggle */}
          <button
            onClick={() => setShowPalette(prev => !prev)}
            className="lg:hidden p-2 rounded-lg bg-background text-text-secondary hover:text-text-primary transition-colors"
            title="Toggle question palette"
          >
            {showPalette ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          {/* Submit */}
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting}
            className="px-5 py-2.5 bg-danger text-white rounded-xl font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Submit
            </span>
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question Area */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {/* Question Header */}
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-primary">
                Question {currentQuestion + 1} of {totalQuestions}
              </span>
              {questionStates[currentQId] === Q_REVIEW && (
                <button
                  onClick={handleMarkForReview}
                  className="flex items-center gap-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full hover:bg-purple-500/20 transition-colors cursor-pointer"
                  title="Click to unmark"
                >
                  <Bookmark className="w-3 h-3 fill-purple-400" /> Marked for Review ✕
                </button>
              )}
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 rounded-full"
                style={{ width: `${((currentQuestion + 1) / totalQuestions) * 100}%` }}
              />
            </div>
          </div>

          {/* Question Text */}
          <div className="px-6 py-4 flex-1">
            <h2 className="text-lg font-medium text-text-primary leading-relaxed mb-6">
              {qText}
            </h2>

            {/* Options */}
            <div className="space-y-3 max-w-3xl">
              {qOptions.map((option, index) => {
                const optId = option.option_id || String(index)
                const optText = typeof option === 'string' ? option : option.text
                const isSelected = answers[currentQId] === optId

                return (
                  <button
                    key={optId}
                    onClick={() => handleAnswerSelect(currentQId, optId)}
                    className={`w-full p-4 rounded-xl text-left transition-all border-2 group ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40 bg-card hover:bg-card/80'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Option letter circle */}
                      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'bg-surface-light text-text-secondary group-hover:bg-primary/20 group-hover:text-primary'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className={`text-base ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                        {optText}
                      </span>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-primary ml-auto shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Action Buttons Footer ─── */}
          <div className="px-6 py-4 border-t border-border bg-card shrink-0">
            <div className="flex items-center justify-between max-w-3xl">
              <div className="flex items-center gap-2">
                {/* Previous */}
                <button
                  onClick={() => goToQuestion(currentQuestion - 1)}
                  disabled={currentQuestion === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-light text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                {/* Clear Response */}
                <button
                  onClick={handleClearResponse}
                  disabled={!answers[currentQId]}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-light text-text-secondary hover:text-warning transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Mark for Review & Next */}
                <button
                  onClick={handleMarkForReview}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    questionStates[currentQId] === Q_REVIEW
                      ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/10'
                      : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${questionStates[currentQId] === Q_REVIEW ? 'fill-purple-400' : ''}`} />
                  <span className="hidden sm:inline">
                    {questionStates[currentQId] === Q_REVIEW ? 'Unmark Review' : 'Mark for Review'}
                  </span>
                  <span className="sm:hidden">
                    {questionStates[currentQId] === Q_REVIEW ? 'Unmark' : 'Review'}
                  </span>
                </button>

                {/* Save & Next */}
                <button
                  onClick={handleSaveAndNext}
                  disabled={currentQuestion === totalQuestions - 1}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save & Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ─── Question Palette Sidebar ─── */}
        <aside className={`w-72 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto transition-all duration-300 ${
          showPalette ? 'translate-x-0' : 'translate-x-full hidden lg:flex lg:translate-x-0'
        }`}>
          {/* Palette Header */}
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Question Palette</h3>
          </div>

          {/* Question Grid */}
          <div className="px-4 py-4 flex-1">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, index) => {
                const qId = q.question_id || String(index)
                const state = questionStates[qId] || Q_NOT_VISITED
                const isCurrent = currentQuestion === index
                // If answered but also in review, show review
                const hasAnswer = answers[qId] !== undefined
                let displayState = state
                if (hasAnswer && state !== Q_REVIEW) displayState = Q_ANSWERED

                return (
                  <button
                    key={qId}
                    onClick={() => goToQuestion(index)}
                    className={`exam-palette-btn state-${displayState.replace('-', '-')} ${isCurrent ? 'state-current' : ''}`}
                    title={`Question ${index + 1} — ${displayState.replace('-', ' ')}`}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-border space-y-2">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Legend</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-surface-light shrink-0" />
                <span className="text-text-secondary">Not Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }} />
                <span className="text-text-secondary">Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }} />
                <span className="text-text-secondary">Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }} />
                <span className="text-text-secondary">Review</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 py-3 border-t border-border">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-success/10 rounded-lg px-3 py-2 text-center">
                <span className="text-lg font-bold text-success">{answeredCount}</span>
                <p className="text-success/70">Answered</p>
              </div>
              <div className="bg-purple-500/10 rounded-lg px-3 py-2 text-center">
                <span className="text-lg font-bold text-purple-400">{reviewCount}</span>
                <p className="text-purple-400/70">Review</p>
              </div>
              <div className="bg-warning/10 rounded-lg px-3 py-2 text-center">
                <span className="text-lg font-bold text-warning">{visitedCount}</span>
                <p className="text-warning/70">Skipped</p>
              </div>
              <div className="bg-surface-light rounded-lg px-3 py-2 text-center">
                <span className="text-lg font-bold text-text-secondary">{notVisitedCount}</span>
                <p className="text-text-secondary/70">Not Visited</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Submit Confirmation Modal ─── */}
      {showConfirmModal && (
        <div className="exam-modal-backdrop" onClick={() => setShowConfirmModal(false)}>
          <div
            className="bg-card rounded-2xl border border-border p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-danger" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Submit Assessment?</h2>
              <p className="text-text-secondary mt-2 text-sm">Please review your attempt summary before submitting.</p>
            </div>

            {/* Summary */}
            <div className="bg-background rounded-xl p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary text-sm">Total Questions</span>
                <span className="text-text-primary font-semibold">{totalQuestions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-success/30" />
                  <span className="text-text-secondary">Answered</span>
                </span>
                <span className="text-success font-semibold">{answeredCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-purple-500/30" />
                  <span className="text-text-secondary">Marked for Review</span>
                </span>
                <span className="text-purple-400 font-semibold">{reviewCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-surface-light" />
                  <span className="text-text-secondary">Not Attempted</span>
                </span>
                <span className="text-text-secondary font-semibold">{totalQuestions - answeredCount}</span>
              </div>
              {timeLeft !== null && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-text-secondary text-sm">Time Remaining</span>
                  <span className={`font-mono font-bold ${isCriticalTime ? 'text-danger' : 'text-primary'}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
              )}
            </div>

            {(totalQuestions - answeredCount) > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 mb-6">
                <p className="text-warning text-sm font-medium">
                  ⚠️ You have {totalQuestions - answeredCount} unanswered question{totalQuestions - answeredCount > 1 ? 's' : ''}.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-surface-light text-text-secondary hover:text-text-primary transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleSubmitFinal}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-danger text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader size="sm" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Confirm Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
