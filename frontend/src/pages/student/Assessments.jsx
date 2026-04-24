import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code, FileQuestion, Clock, CheckCircle } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/Card'
import Button from '../../components/Button'
import { CardSkeleton } from '../../components/Loader'
import Badge from '../../components/Badge'

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
            statusMap[assessment.id] = statusData.mcq_submitted || statusData.coding_submitted
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
            return (
              <Card key={assessment.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      aType === 'mcq' ? 'bg-primary/10' : 'bg-success/10'
                    }`}>
                      {aType === 'mcq' ? (
                        <FileQuestion className="w-5 h-5 text-primary" />
                      ) : (
                        <Code className="w-5 h-5 text-success" />
                      )}
                    </div>
                    <Badge variant={completed ? 'success' : 'warning'}>
                      {completed ? 'Completed' : 'Pending'}
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
                      {aType === 'mcq' ? (
                        <>
                          <FileQuestion className="w-4 h-4" />
                          MCQ
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
                  </div>
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
