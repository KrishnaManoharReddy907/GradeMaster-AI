import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileQuestion, Code, PenLine, CheckCircle, BookOpen } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Badge from '../../components/Badge'
import Loader from '../../components/Loader'

export default function QuestionReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await studentAPI.getReviewQuestions(token, id)
        setData(result)
      } catch (error) {
        console.error('Failed to fetch questions:', error)
        addToast(error.message || 'Failed to load question paper', 'error')
        navigate('/student/assessments')
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

  const aType = data.assessment_type || 'mcq'
  const mcqQuestions = data.mcq_questions || []
  const codingQuestions = data.coding_questions || []
  const manualQuestions = data.manual_questions || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/student/assessments')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">{data.title}</h1>
          <p className="text-text-secondary mt-1">Question Paper — Read Only (For Practice)</p>
        </div>
        <Badge variant="default">
          <BookOpen className="w-3.5 h-3.5" />
          Practice Mode
        </Badge>
      </div>

      {/* Assessment Info */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {aType === 'mcq' ? 'MCQ' : aType === 'coding' ? 'Coding' : aType === 'manual' ? 'Handwritten' : 'Mixed'}
          </span>
          <span className="text-sm text-text-secondary">
            Total Marks: <strong className="text-text-primary">{data.total_marks}</strong>
          </span>
          {data.duration_minutes && (
            <span className="text-sm text-text-secondary">
              Duration: <strong className="text-text-primary">{data.duration_minutes} min</strong>
            </span>
          )}
          {data.description && (
            <span className="text-sm text-text-secondary">{data.description}</span>
          )}
        </div>
      </Card>

      {/* MCQ Questions */}
      {mcqQuestions.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileQuestion className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">MCQ Questions</h2>
              <p className="text-sm text-text-secondary">{mcqQuestions.length} question{mcqQuestions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="space-y-6">
            {mcqQuestions.map((q, qIndex) => (
              <div key={q.question_id} className="p-4 rounded-xl border border-border bg-background">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {qIndex + 1}
                    </span>
                    <p className="text-text-primary font-medium leading-relaxed">{q.question_text}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      q.difficulty === 'easy' ? 'bg-success/10 text-success' :
                      q.difficulty === 'hard' ? 'bg-error/10 text-error' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {q.difficulty || 'medium'}
                    </span>
                    <span className="text-xs text-text-secondary">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                <div className="space-y-2 ml-11">
                  {q.options?.map((option) => {
                    const isCorrect = option.option_id === q.correct_option_id
                    return (
                      <div
                        key={option.option_id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                          isCorrect
                            ? 'border-success/50 bg-success/10'
                            : 'border-border bg-background'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                          isCorrect ? 'border-success text-success' : 'border-border text-text-secondary'
                        }`}>
                          {option.option_id.toUpperCase()}
                        </span>
                        <span className={`text-sm flex-1 ${
                          isCorrect ? 'text-success font-medium' : 'text-text-secondary'
                        }`}>
                          {option.text}
                        </span>
                        {isCorrect && <CheckCircle className="w-4 h-4 text-success shrink-0" />}
                        {isCorrect && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-success/20 text-success">
                            Correct Answer
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Coding Questions */}
      {codingQuestions.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Code className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Coding Questions</h2>
              <p className="text-sm text-text-secondary">{codingQuestions.length} question{codingQuestions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="space-y-6">
            {codingQuestions.map((q, qIndex) => (
              <div key={q.question_id} className="p-4 rounded-xl border border-border bg-background">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-sm font-bold text-success shrink-0">
                      {qIndex + 1}
                    </span>
                    <div>
                      <h3 className="text-text-primary font-semibold">{q.title}</h3>
                      <span className="text-xs text-text-secondary">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    q.difficulty === 'easy' ? 'bg-success/10 text-success' :
                    q.difficulty === 'hard' ? 'bg-error/10 text-error' :
                    'bg-warning/10 text-warning'
                  }`}>
                    {q.difficulty || 'medium'}
                  </span>
                </div>

                <div className="ml-11 space-y-3">
                  <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                    {q.problem_statement}
                  </div>

                  {q.input_format && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary mb-1">Input Format</p>
                      <p className="text-sm text-text-secondary">{q.input_format}</p>
                    </div>
                  )}
                  {q.output_format && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary mb-1">Output Format</p>
                      <p className="text-sm text-text-secondary">{q.output_format}</p>
                    </div>
                  )}
                  {q.constraints && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary mb-1">Constraints</p>
                      <p className="text-sm text-text-secondary font-mono">{q.constraints}</p>
                    </div>
                  )}

                  {(q.sample_input || q.sample_output) && (
                    <div className="grid grid-cols-2 gap-3">
                      {q.sample_input && (
                        <div className="p-3 rounded-lg bg-surface border border-border">
                          <p className="text-xs font-semibold text-text-primary mb-1">Sample Input</p>
                          <pre className="text-sm text-text-secondary font-mono whitespace-pre-wrap">{q.sample_input}</pre>
                        </div>
                      )}
                      {q.sample_output && (
                        <div className="p-3 rounded-lg bg-surface border border-border">
                          <p className="text-xs font-semibold text-text-primary mb-1">Sample Output</p>
                          <pre className="text-sm text-text-secondary font-mono whitespace-pre-wrap">{q.sample_output}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Manual Questions */}
      {manualQuestions.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <PenLine className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Handwritten Questions</h2>
              <p className="text-sm text-text-secondary">{manualQuestions.length} question{manualQuestions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="space-y-4">
            {manualQuestions.map((q, qIndex) => (
              <div key={q.question_id} className="p-4 rounded-xl border border-border bg-background">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-sm font-bold text-secondary shrink-0">
                    {qIndex + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-text-primary font-medium leading-relaxed">{q.question_text}</p>
                    <p className="text-xs text-text-secondary mt-1">{q.marks} mark{q.marks !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
