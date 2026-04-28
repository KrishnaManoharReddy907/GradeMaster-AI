import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, FileQuestion, Info, User } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Badge from '../../components/Badge'
import Loader from '../../components/Loader'

export default function MCQDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await teacherAPI.getMcqSubmissionDetail(token, id)
        setData(result)
      } catch (error) {
        console.error('Failed to fetch MCQ details:', error)
        addToast('Failed to load MCQ submission details', 'error')
        navigate(-1)
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

  if (!data) return null

  const results = data.results || []
  const questions = data.mcq_questions || []
  const correctCount = results.filter(r => r.is_correct).length
  const percentage = data.percentage != null ? Math.round(data.percentage) : 
    (data.score != null && data.total_marks ? Math.round((data.score / data.total_marks) * 100) : 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">{data.assessment_title}</h1>
          <p className="text-text-secondary mt-1">MCQ Submission — Read Only</p>
        </div>
        <Badge variant="success">Auto-Evaluated</Badge>
      </div>

      {/* Student Info + Score Summary */}
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{data.student_name}</h2>
            <p className="text-sm text-text-secondary">{data.student_email}</p>
          </div>
          {data.submitted_at && (
            <p className="ml-auto text-sm text-text-secondary">
              Submitted: {new Date(data.submitted_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-background rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-primary">{data.score ?? '-'}</p>
            <p className="text-sm text-text-secondary mt-1">Score</p>
          </div>
          <div className="bg-background rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-text-primary">{data.total_marks ?? '-'}</p>
            <p className="text-sm text-text-secondary mt-1">Total Marks</p>
          </div>
          <div className="bg-background rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${percentage >= 60 ? 'text-success' : 'text-error'}`}>
              {percentage}%
            </p>
            <p className="text-sm text-text-secondary mt-1">Percentage</p>
          </div>
          <div className="bg-background rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-text-primary">{correctCount}/{results.length}</p>
            <p className="text-sm text-text-secondary mt-1">Correct</p>
          </div>
        </div>
      </Card>

      {/* Per-question review */}
      {questions.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-text-primary mb-4">Question-by-Question Review</h3>
          <div className="space-y-6">
            {questions.map((question, qIndex) => {
              const result = results.find(r => r.question_id === question.question_id)
              const isCorrect = result?.is_correct ?? true
              const selectedId = result?.selected_option_id
              const correctId = question.correct_option_id
              const explanation = result?.ai_explanation || ''
              const difficulty = question.difficulty || 'medium'

              return (
                <div
                  key={question.question_id}
                  className={`p-4 rounded-xl border ${
                    isCorrect
                      ? 'border-success/30 bg-success/5'
                      : 'border-error/30 bg-error/5'
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                        isCorrect ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                      }`}>
                        {qIndex + 1}
                      </span>
                      <p className="text-text-primary font-medium leading-relaxed">{question.question_text}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        difficulty === 'easy' ? 'bg-success/10 text-success' :
                        difficulty === 'hard' ? 'bg-error/10 text-error' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {difficulty}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {result?.marks_obtained ?? 0}/{question.marks || 1}
                      </span>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-2 ml-11">
                    {question.options?.map((option) => {
                      const isSelected = option.option_id === selectedId
                      const isCorrectOption = option.option_id === correctId

                      let optionClass = 'border-border bg-background'
                      let icon = null

                      if (isCorrectOption) {
                        optionClass = 'border-success/50 bg-success/10'
                        icon = <CheckCircle className="w-4 h-4 text-success shrink-0" />
                      } else if (isSelected && !isCorrect) {
                        optionClass = 'border-error/50 bg-error/10'
                        icon = <XCircle className="w-4 h-4 text-error shrink-0" />
                      }

                      return (
                        <div
                          key={option.option_id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${optionClass} transition-all`}
                        >
                          <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                            isCorrectOption ? 'border-success text-success' :
                            isSelected && !isCorrect ? 'border-error text-error' :
                            'border-border text-text-secondary'
                          }`}>
                            {option.option_id.toUpperCase()}
                          </span>
                          <span className={`text-sm flex-1 ${
                            isCorrectOption ? 'text-success font-medium' :
                            isSelected && !isCorrect ? 'text-error' :
                            'text-text-secondary'
                          }`}>
                            {option.text}
                          </span>
                          {icon}
                          {isSelected && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isCorrect ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                            }`}>
                              Student's answer
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* AI Explanation for wrong answers */}
                  {!isCorrect && explanation && (
                    <div className="mt-3 ml-11 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        AI Explanation
                      </p>
                      <p className="text-sm text-text-secondary leading-relaxed">{explanation}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
