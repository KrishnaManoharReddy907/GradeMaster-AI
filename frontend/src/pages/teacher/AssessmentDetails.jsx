import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Code, FileQuestion, Users, Clock, Play, PenLine, BarChart3 } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/Card'
import Button from '../../components/Button'
import { CardSkeleton } from '../../components/Loader'
import Badge from '../../components/Badge'

export default function AssessmentDetails() {
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState({})
  const [assessments, setAssessments] = useState([])
  const [assessmentStats, setAssessmentStats] = useState({})

  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        const [response, statsData] = await Promise.all([
          teacherAPI.getAssessments(token),
          teacherAPI.getAssessmentStats(token).catch(() => ({})),
        ])
        const assessmentList = Array.isArray(response) ? response : response.assessments || []
        setAssessments(assessmentList)
        setAssessmentStats(statsData)
      } catch (error) {
        console.error('Failed to fetch assessments:', error)
        addToast('Failed to load assessments', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchAssessments()
  }, [token, addToast])

  const handleBatchEvaluate = async (assessmentId) => {
    setEvaluating(prev => ({ ...prev, [assessmentId]: true }))
    try {
      await teacherAPI.evaluateAssessment(token, assessmentId)
      addToast('AI evaluation started for all submissions', 'success')
    } catch (error) {
      console.error('Batch evaluation failed:', error)
      addToast(error.message || 'Failed to start batch evaluation', 'error')
    } finally {
      setEvaluating(prev => ({ ...prev, [assessmentId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Assessments</h1>
          <p className="text-text-secondary mt-1">Manage your assessments and view submissions</p>
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
        <p className="text-text-secondary mt-1">Manage your assessments and view submissions</p>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No assessments yet</h3>
            <p className="text-text-secondary mb-4">Create your first assessment to get started</p>
            <Button onClick={() => navigate('/teacher/create-assessment')}>
              Create Assessment
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessments.map((assessment) => {
            const aType = assessment.assessment_type || assessment.type || 'mcq'
            const aStats = assessmentStats[assessment.id] || {}
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
                    <Badge variant="default">
                      {aType === 'mcq' ? 'MCQ' : aType === 'coding' ? 'Coding' : aType === 'manual' ? 'Manual' : 'Mixed'}
                    </Badge>
                  </div>
                  <CardTitle className="mt-4">{assessment.title}</CardTitle>
                  <CardDescription>
                    {assessment.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1">
                  <div className="flex items-center gap-4 text-sm text-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      {aStats.submissions_count || 0} submissions
                    </span>
                    {(assessment.duration_minutes || assessment.duration) && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {assessment.duration_minutes || assessment.duration} min
                      </span>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => navigate(`/teacher/assessments/${assessment.id}/submissions`)}
                  >
                    View Submissions
                  </Button>
                  {(() => {
                    // Parse end_time as UTC — backend returns ISO without Z suffix
                    const et = assessment.end_time
                    if (!et) return null
                    const endMs = new Date(et.endsWith('Z') ? et : et + 'Z').getTime()
                    const isPast = endMs < Date.now()

                    return (
                      <>
                        {isPast && (
                          <Button
                            variant="primary"
                            className="flex-1"
                            onClick={() => navigate(`/teacher/assessments/${assessment.id}/report`)}
                          >
                            <BarChart3 className="w-4 h-4" />
                            View Report
                          </Button>
                        )}
                        {aType !== 'manual' && !isPast && (
                          <Button
                            variant="primary"
                            size="md"
                            onClick={() => handleBatchEvaluate(assessment.id)}
                            loading={evaluating[assessment.id]}
                            title="Run AI evaluation on all submissions"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    )
                  })()}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
