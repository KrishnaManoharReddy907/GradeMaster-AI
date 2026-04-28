import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code, FileQuestion, Clock, CheckCircle, PenLine, BookOpen } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/Card'
import Button from '../../components/Button'
import { CardSkeleton } from '../../components/Loader'

export default function Assessments() {
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [assessments, setAssessments] = useState([])
  const [submissionMap, setSubmissionMap] = useState({})

  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        const response = await studentAPI.getAssessments(token)
        const assessmentList = Array.isArray(response) ? response : response.assessments || []
        setAssessments(assessmentList)
        
        // Check submission status for each assessment
        const statusMap = {}
        await Promise.all(assessmentList.map(async (assessment) => {
          try {
            const statusData = await studentAPI.getSubmissionStatus(token, assessment.id)
            statusMap[assessment.id] = statusData.mcq_submitted || statusData.coding_submitted || statusData.manual_submitted
          } catch {
            statusMap[assessment.id] = false
          }
        }))
        setSubmissionMap(statusMap)
      } catch (error) {
        console.error('Failed to fetch assessments:', error)
        addToast('Failed to load assessments', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchAssessments()
  }, [token, addToast])

  const handleStart = (assessment) => {
    const aType = assessment.assessment_type || assessment.type || 'mcq'
    if (aType === 'mcq') {
      navigate(`/student/assessments/${assessment.id}/mcq`)
    } else if (aType === 'manual') {
      navigate(`/student/assessments/${assessment.id}/manual`)
    } else {
      navigate(`/student/assessments/${assessment.id}/coding`)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Assessments</h1>
          <p className="text-text-secondary mt-1">View and complete your assigned assessments</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Assessments</h1>
        <p className="text-text-secondary mt-1">View and complete your assigned assessments</p>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <FileQuestion className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No assessments available</h3>
            <p className="text-text-secondary">Check back later for new assignments.</p>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessments.map((assessment) => {
            const aType = assessment.assessment_type || assessment.type || 'mcq'
            const completed = submissionMap[assessment.id] || false
            const duration = assessment.duration_minutes || assessment.duration

            // Parse dates as UTC (backend returns without Z suffix)
            const parseUTC = (d) => d ? new Date(String(d).endsWith('Z') ? d : d + 'Z') : null
            const startT = parseUTC(assessment.start_time)
            const endT = parseUTC(assessment.end_time)
            const assessmentStatus = assessment.status // from backend: 'upcoming', 'active', 'ended'
            
            let cardStatus, badgeText, badgeClass, badgeExtra = ''
            if (completed) {
              cardStatus = 'completed'
              badgeText = 'Completed'
              badgeClass = 'bg-success/10 text-success border border-success/20'
            } else if (assessmentStatus === 'ended') {
              cardStatus = 'ended'
              badgeText = 'Ended'
              badgeClass = 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
            } else if (assessmentStatus === 'upcoming') {
              cardStatus = 'upcoming'
              badgeText = 'Upcoming'
              badgeClass = 'bg-primary/10 text-primary border border-primary/20'
            } else {
              // Active — check strict vs window for Live/Active distinction
              const windowMin = (startT && endT) ? Math.round((endT - startT) / 60000) : 999
              const isStrict = duration && windowMin <= duration
              if (isStrict) {
                cardStatus = 'live'
                badgeText = 'Live'
                badgeClass = 'bg-error/10 text-error border border-error/30'
                badgeExtra = 'animate-pulse'
              } else {
                cardStatus = 'active'
                badgeText = 'Active'
                badgeClass = 'bg-warning/10 text-warning border border-warning/20'
              }
            }

            return (
              <Card key={assessment.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      aType === 'mcq' ? 'bg-primary/10' : aType === 'manual' ? 'bg-secondary/10' : 'bg-success/10'
                    }`}>
                      {aType === 'mcq' ? (
                        <FileQuestion className="w-5 h-5 text-primary" />
                      ) : aType === 'manual' ? (
                        <PenLine className="w-5 h-5 text-secondary" />
                      ) : (
                        <Code className="w-5 h-5 text-success" />
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badgeClass} ${badgeExtra}`}>
                      {cardStatus === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-error mr-1.5 animate-ping" />}
                      {badgeText}
                    </span>
                  </div>
                  <CardTitle className="mt-4">{assessment.title}</CardTitle>
                  <CardDescription>
                    {assessment.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1">
                  <div className="flex items-center gap-4 text-sm text-text-secondary flex-wrap">
                    <span className="flex items-center gap-1.5">
                      {aType === 'mcq' ? (
                        <>
                          <FileQuestion className="w-4 h-4" />
                          MCQ
                        </>
                      ) : aType === 'manual' ? (
                        <>
                          <PenLine className="w-4 h-4" />
                          Handwritten
                        </>
                      ) : (
                        <>
                          <Code className="w-4 h-4" />
                          Coding
                        </>
                      )}
                    </span>
                    {duration && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {duration} min
                      </span>
                    )}
                    {/* Exam mode indicator */}
                    {(() => {
                      if (aType === 'manual') {
                        return (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-secondary/10 text-secondary border border-secondary/15"
                            title="Submit before the deadline"
                          >
                            📋 Deadline
                          </span>
                        )
                      }
                      if (!startT || !endT || !duration) return null
                      const windowMin = Math.round((endT - startT) / 60000)
                      const isStrict = windowMin <= duration
                      return (
                        <span
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${
                            isStrict
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                              : 'bg-primary/10 text-primary border border-primary/15'
                          }`}
                          title={isStrict
                            ? 'Fixed start time — exam begins at the scheduled time'
                            : `Flexible — start anytime within the ${windowMin}-min window`
                          }
                        >
                          {isStrict ? '⏱️ Fixed' : '🪟 Window'}
                        </span>
                      )
                    })()}
                  </div>

                  {/* Time info for upcoming/active */}
                  {cardStatus === 'upcoming' && startT && (
                    <p className="text-xs text-primary mt-3">
                      Starts: {startT.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, {startT.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                  {(cardStatus === 'live' || cardStatus === 'active') && endT && (
                    <p className="text-xs text-warning mt-3">
                      Ends: {endT.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, {endT.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                  {cardStatus === 'ended' && endT && (
                    <p className="text-xs text-zinc-400 mt-3">
                      Ended: {endT.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, {endT.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                </CardContent>

                <CardFooter>
                  {completed ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => navigate('/student/submissions')}
                    >
                      <CheckCircle className="w-4 h-4" />
                      View Submission
                    </Button>
                  ) : cardStatus === 'ended' ? (
                    <div className="w-full space-y-2">
                      <Button variant="ghost" className="w-full" disabled>
                        Missed
                      </Button>
                      {assessment.release_questions_after_deadline && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => navigate(`/student/assessments/${assessment.id}/review-questions`)}
                        >
                          <BookOpen className="w-4 h-4" />
                          View Questions
                        </Button>
                      )}
                    </div>
                  ) : cardStatus === 'upcoming' ? (
                    <Button variant="ghost" className="w-full" disabled>
                      Not Started Yet
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleStart(assessment)}
                    >
                      Start Assessment
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
