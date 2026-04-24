import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Layers, BookOpen, Users, UserPlus, Clock } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import Button from '../../components/Button'
import { CardSkeleton } from '../../components/Loader'

export default function AdminDashboard() {
  const { token, user, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    departments: 0,
    sections: 0,
    subjects: 0,
    pendingUsers: 0,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [departments, sections, subjects, pendingUsers] = await Promise.all([
          adminAPI.getDepartments(token).catch(() => []),
          adminAPI.getSections(token).catch(() => []),
          adminAPI.getSubjects(token).catch(() => []),
          adminAPI.getPendingUsers(token).catch(() => []),
        ])

        setStats({
          departments: Array.isArray(departments) ? departments.length : departments.departments?.length || 0,
          sections: Array.isArray(sections) ? sections.length : sections.sections?.length || 0,
          subjects: Array.isArray(subjects) ? subjects.length : subjects.subjects?.length || 0,
          pendingUsers: Array.isArray(pendingUsers) ? pendingUsers.length : pendingUsers.users?.length || 0,
        })
      } catch (error) {
        console.error('[v0] Failed to fetch admin data:', error)
        addToast('Failed to load dashboard data', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [token, addToast])

  const statCards = [
    { icon: Building2, label: 'Departments', value: stats.departments, color: 'text-primary', bg: 'bg-primary/10', link: '/admin/departments' },
    { icon: Layers, label: 'Sections', value: stats.sections, color: 'text-success', bg: 'bg-success/10', link: '/admin/sections' },
    { icon: BookOpen, label: 'Subjects', value: stats.subjects, color: 'text-warning', bg: 'bg-warning/10', link: '/admin/subjects' },
    { icon: Clock, label: 'Pending Approvals', value: stats.pendingUsers, color: 'text-error', bg: 'bg-error/10', link: '/admin/pending-users' },
  ]

  const quickActions = [
    { icon: Building2, label: 'Add Department', link: '/admin/departments' },
    { icon: Layers, label: 'Add Section', link: '/admin/sections' },
    { icon: BookOpen, label: 'Add Subject', link: '/admin/subjects' },
    { icon: UserPlus, label: 'Assign Teacher', link: '/admin/assign-teacher' },
    { icon: Users, label: 'Manage Users', link: '/admin/pending-users' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome, {user?.name || 'Admin'}!
        </h1>
        <p className="text-text-secondary mt-1">
          Manage departments, sections, subjects, and users
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Link key={stat.label} to={stat.link}>
              <Card hover>
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
            </Link>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.link}>
                <Button variant="secondary" className="w-full justify-start">
                  <action.icon className="w-5 h-5" />
                  {action.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
