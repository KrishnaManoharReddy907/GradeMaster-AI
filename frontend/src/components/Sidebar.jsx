import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  PlusCircle,
  Users,
  Building2,
  Layers,
  BookOpen,
  UserPlus,
  Clock,
  BarChart3,
} from 'lucide-react'
import { useApp, normalizeRoleForRoute } from '../lib/context/AppContext'

const studentLinks = [
  { to: '/student', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/student/assessments', icon: FileText, label: 'Assessments' },
  { to: '/student/submissions', icon: CheckSquare, label: 'Submission Status' },
  { to: '/student/analytics', icon: BarChart3, label: 'Analytics' },
]

const teacherLinks = [
  { to: '/teacher', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/teacher/create-assessment', icon: PlusCircle, label: 'Create Assessment' },
  { to: '/teacher/assessments', icon: FileText, label: 'Assessments' },
  { to: '/teacher/analytics', icon: BarChart3, label: 'Analytics' },
]

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/departments', icon: Building2, label: 'Departments' },
  { to: '/admin/sections', icon: Layers, label: 'Sections' },
  { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
  { to: '/admin/assign-teacher', icon: UserPlus, label: 'Assign Teacher' },
  { to: '/admin/pending-users', icon: Clock, label: 'Pending Users' },
]

const linksByRole = {
  student: studentLinks,
  teacher: teacherLinks,
  faculty: teacherLinks,
  hod: teacherLinks,
  admin: adminLinks,
}

export default function Sidebar() {
  const { user } = useApp()
  const normalizedRole = normalizeRoleForRoute(user?.role)
  const links = linksByRole[user?.role] || linksByRole[normalizedRole] || []

  return (
    <aside className="w-64 bg-card border-r border-border h-[calc(100vh-4rem)] overflow-y-auto shrink-0">
      <nav className="p-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-background'
            )}
          >
            <link.icon className="w-5 h-5" />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
