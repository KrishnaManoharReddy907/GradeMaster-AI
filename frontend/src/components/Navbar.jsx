import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LogOut, User, GraduationCap, Sun, Moon,
  LayoutDashboard, FileText, CheckSquare, PlusCircle,
  Building2, Layers, BookOpen, UserPlus, Clock, BarChart3,
} from 'lucide-react'
import { useApp, normalizeRoleForRoute } from '../lib/context/AppContext'
import { useNavigate } from 'react-router-dom'

const roleColors = {
  student: 'bg-primary/20 text-primary',
  teacher: 'bg-success/20 text-success',
  faculty: 'bg-success/20 text-success',
  hod: 'bg-success/20 text-success',
  admin: 'bg-warning/20 text-warning',
}

const studentLinks = [
  { to: '/student', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/student/assessments', icon: FileText, label: 'Assessments' },
  { to: '/student/submissions', icon: CheckSquare, label: 'Submissions' },
  { to: '/student/analytics', icon: BarChart3, label: 'Analytics' },
]

const teacherLinks = [
  { to: '/teacher', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/teacher/create-assessment', icon: PlusCircle, label: 'Create' },
  { to: '/teacher/assessments', icon: FileText, label: 'Assessments' },
  { to: '/teacher/analytics', icon: BarChart3, label: 'Analytics' },
]

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/departments', icon: Building2, label: 'Departments' },
  { to: '/admin/sections', icon: Layers, label: 'Sections' },
  { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
  { to: '/admin/assign-teacher', icon: UserPlus, label: 'Assign' },
  { to: '/admin/pending-users', icon: Clock, label: 'Pending' },
]

const linksByRole = {
  student: studentLinks,
  teacher: teacherLinks,
  faculty: teacherLinks,
  hod: teacherLinks,
  admin: adminLinks,
}

export default function Navbar() {
  const { user, logout, theme, toggleTheme } = useApp()
  const navigate = useNavigate()
  const normalizedRole = normalizeRoleForRoute(user?.role)
  const links = linksByRole[user?.role] || linksByRole[normalizedRole] || []

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 bg-card/95 backdrop-blur-md border-b border-border sticky top-0 z-40">
      <div className="h-full px-4 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-text-primary hidden sm:block">
            GradeMaster
          </span>
        </div>

        {/* Nav Links — centered area */}
        {user && (
          <nav className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-1 bg-background/50 rounded-xl px-1.5 py-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-light/50'
                  )}
                >
                  <link.icon className="w-4 h-4" />
                  <span className="hidden md:inline">{link.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        )}

        {/* Right side: theme toggle + user info */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-background/50 text-text-secondary hover:text-text-primary hover:bg-surface-light transition-all duration-200"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4.5 h-4.5" />
            ) : (
              <Moon className="w-4.5 h-4.5" />
            )}
          </button>

          {user && (
            <>
              {/* Role Badge */}
              <span className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${roleColors[user.role] || 'bg-primary/20 text-primary'}`}>
                <User className="w-3 h-3" />
                {user.role}
              </span>

              {/* User Name */}
              <span className="hidden sm:block text-sm text-text-secondary font-medium max-w-[120px] truncate">
                {user.name}
              </span>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-all duration-200"
                title="Logout"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
