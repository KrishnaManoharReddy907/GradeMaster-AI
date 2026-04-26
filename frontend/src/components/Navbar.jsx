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
  student: 'bg-primary/10 text-primary border border-primary/15',
  teacher: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  faculty: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  hod: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  admin: 'bg-amber-500/10 text-amber-400 border border-amber-500/15',
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
    <header className="h-14 bg-card/70 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-40">
      <div className="h-full px-4 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-base font-semibold text-text-primary tracking-tight hidden sm:block">
            GradeMaster
          </span>
        </div>

        {/* Nav Links */}
        {user && (
          <nav className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-xl px-1 py-1 border border-white/[0.04]">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-white shadow-sm shadow-primary/25'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                  )}
                >
                  <link.icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{link.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all duration-200"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {user && (
            <>
              {/* Role Badge */}
              <span className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium uppercase tracking-wider ${roleColors[user.role] || 'bg-primary/10 text-primary'}`}>
                {user.role}
              </span>

              {/* User Name */}
              <span className="hidden sm:block text-[13px] text-text-secondary font-medium max-w-[120px] truncate">
                {user.name}
              </span>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
