import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import { CardSkeleton } from '../../components/Loader'
import Badge from '../../components/Badge'

export default function StudentDashboard() {
  const { token, user, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalAssessments: 0,
    completed: 0,
    pending: 0,
    avgScore: 0,
  })
  const [recentAssessments, setRecentAssessments] = useState([])
  const [submissionMap, setSubmissionMap] = useState({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch ALL assessments (active + past + upcoming)
        const assessments = await studentAPI.getAssessments(token)
        const allAssessments = Array.isArray(assessments) ? assessments : assessments.assessments || []

        setRecentAssessments(allAssessments.slice(0, 5))
        
        // Check submission status for each assessment to determine completed vs pending
        const statusMap = {}
        let completedCount = 0
        let totalScore = 0
        let scoredCount = 0
        
        await Promise.all(allAssessments.map(async (assessment) => {
          try {
            const statusData = await studentAPI.getSubmissionStatus(token, assessment.id)
            const hasSubmitted = statusData.mcq_submitted || statusData.coding_submitted || statusData.manual_submitted
            statusMap[assessment.id] = hasSubmitted

            if (hasSubmitted) {
              completedCount++
              // Count MCQ score
              if (statusData.mcq_submitted && statusData.mcq_score != null && statusData.mcq_total) {
                totalScore += (statusData.mcq_score / statusData.mcq_total) * 100
                scoredCount++
              }
              // Count coding scores (use final_score > ai_score > score)
              if (statusData.coding_submitted && statusData.coding_submissions?.length > 0) {
                for (const cs of statusData.coding_submissions) {
                  const csScore = cs.final_score ?? cs.ai_score ?? cs.score
                  const csMax = cs.max_marks
                  if (csScore != null && csMax) {
                    totalScore += (csScore / csMax) * 100
                    scoredCount++
                  }
                }
              }
              // Count manual scores (finalized only)
              if (statusData.manual_submitted && statusData.manual_score != null && statusData.manual_total) {
                totalScore += (statusData.manual_score / statusData.manual_total) * 100
                scoredCount++
              }
            }
          } catch {
            statusMap[assessment.id] = false
          }
        }))
        
        setSubmissionMap(statusMap)
        setStats({
          totalAssessments: allAssessments.length,
          completed: completedCount,
          pending: allAssessments.length - completedCount,
          avgScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
        })
      } catch (error) {
        console.error('Failed to fetch assessments:', error)
        addToast('Failed to load dashboard data', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [token, addToast])

  const statCards = [
    { icon: FileText, label: 'Total Assessments', value: stats.totalAssessments, color: 'text-primary', bg: 'bg-primary/10' },
    { icon: CheckCircle, label: 'Completed', value: stats.completed, color: 'text-success', bg: 'bg-success/10' },
    { icon: Clock, label: 'Pending', value: stats.pending, color: 'text-warning', bg: 'bg-warning/10' },
    { icon: TrendingUp, label: 'Average Score', value: `${stats.avgScore}%`, color: 'text-primary', bg: 'bg-primary/10' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome back, {user?.name || 'Student'}!
        </h1>
        <p className="text-text-secondary mt-1">
          Here&apos;s an overview of your assessments
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
                <p className="text-sm text-text-secondary">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Assessments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Assessments</CardTitle>
            <Link to="/student/assessments" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : recentAssessments.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">
              No assessments available yet
            </div>
          ) : (
            <div className="space-y-3">
              {recentAssessments.map((assessment) => {
                const aType = assessment.assessment_type || assessment.type || 'mcq'
                const completed = submissionMap[assessment.id] || false
                const status = assessment.status
                
                let badgeText, badgeClass
                if (completed) {
                  badgeText = 'Completed'
                  badgeClass = 'bg-success/10 text-success'
                } else if (status === 'ended') {
                  badgeText = 'Missed'
                  badgeClass = 'bg-error/10 text-error'
                } else if (status === 'upcoming') {
                  badgeText = 'Upcoming'
                  badgeClass = 'bg-primary/10 text-primary'
                } else {
                  badgeText = 'Pending'
                  badgeClass = 'bg-warning/10 text-warning'
                }
                return (
                  <Link
                    key={assessment.id}
                    to="/student/assessments"
                    className="block p-4 bg-background rounded-xl hover:border-primary/50 border border-transparent transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-text-primary">{assessment.title}</h3>
                        <p className="text-sm text-text-secondary mt-0.5">
                          {aType === 'mcq' ? 'MCQ Assessment' : aType === 'coding' ? 'Coding Assessment' : aType === 'manual' ? 'Handwritten Assignment' : 'Mixed Assessment'}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                        {badgeText}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
