import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Users, CheckCircle, Clock, PlusCircle } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import Button from '../../components/Button'
import { CardSkeleton } from '../../components/Loader'
import Badge from '../../components/Badge'

export default function TeacherDashboard() {
  const { token, user, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalAssessments: 0,
    totalSubmissions: 0,
    pendingReview: 0,
    reviewed: 0,
  })
  const [recentAssessments, setRecentAssessments] = useState([])
  const [assessmentStats, setAssessmentStats] = useState({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch assessments and stats in parallel
        const [assessments, statsData] = await Promise.all([
          teacherAPI.getAssessments(token),
          teacherAPI.getAssessmentStats(token).catch(() => ({})),
        ])
        const assessmentList = Array.isArray(assessments) ? assessments : assessments.assessments || []
        
        setRecentAssessments(assessmentList.slice(0, 5))
        setAssessmentStats(statsData)
        
        // Calculate totals from the stats endpoint
        let totalSubmissions = 0
        let pendingReview = 0
        let reviewed = 0
        
        Object.values(statsData).forEach(s => {
          totalSubmissions += s.submissions_count || 0
          pendingReview += s.pending_count || 0
          reviewed += s.reviewed_count || 0
        })

        setStats({
          totalAssessments: assessmentList.length,
          totalSubmissions,
          pendingReview,
          reviewed,
        })
      } catch (error) {
        console.error('Failed to fetch data:', error)
        addToast('Failed to load dashboard data', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [token, addToast])

  const statCards = [
    { icon: FileText, label: 'Assessments', value: stats.totalAssessments, color: 'text-primary', bg: 'bg-primary/10' },
    { icon: Users, label: 'Total Submissions', value: stats.totalSubmissions, color: 'text-success', bg: 'bg-success/10' },
    { icon: Clock, label: 'Pending Review', value: stats.pendingReview, color: 'text-warning', bg: 'bg-warning/10' },
    { icon: CheckCircle, label: 'Reviewed', value: stats.reviewed, color: 'text-success', bg: 'bg-success/10' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Welcome, {user?.name || 'Teacher'}!
          </h1>
          <p className="text-text-secondary mt-1">
            Manage your assessments and review student submissions
          </p>
        </div>
        <Link to="/teacher/create-assessment">
          <Button>
            <PlusCircle className="w-5 h-5" />
            Create Assessment
          </Button>
        </Link>
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
            <CardTitle>Your Assessments</CardTitle>
            <Link to="/teacher/assessments" className="text-sm text-primary hover:underline">
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
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary mb-2">No assessments yet</h3>
              <p className="text-text-secondary mb-4">Create your first assessment to get started</p>
              <Link to="/teacher/create-assessment">
                <Button>
                  <PlusCircle className="w-5 h-5" />
                  Create Assessment
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAssessments.map((assessment) => {
                const aType = assessment.assessment_type || assessment.type || 'mcq'
                const aStats = assessmentStats[assessment.id] || {}
                return (
                  <Link
                    key={assessment.id}
                    to={`/teacher/assessments/${assessment.id}/submissions`}
                    className="flex items-center justify-between p-4 bg-background rounded-xl hover:border-primary/50 border border-transparent transition-all"
                  >
                    <div>
                      <h3 className="font-medium text-text-primary">{assessment.title}</h3>
                      <p className="text-sm text-text-secondary mt-0.5">
                        {aType === 'mcq' ? 'MCQ' : aType === 'coding' ? 'Coding' : aType === 'manual' ? 'Handwritten' : 'Mixed'} Assessment
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="default">
                        {aStats.submissions_count || 0} submissions
                      </Badge>
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
