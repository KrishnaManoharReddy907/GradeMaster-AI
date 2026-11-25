import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, BookMarked, Building2, ClipboardCheck, ClipboardList, FileClock, GraduationCap, Inbox, KeyRound,
  LayoutDashboard, LibraryBig, LogOut, Menu, Moon, ScrollText, Sun, UserCheck, Users, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/ui-state'
import { Avatar } from './ui'
import { cn } from '@/lib/utils'

const NAV = {
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/approvals', label: 'Approvals', icon: UserCheck, counter: 'approvals' },
    { to: '/admin/users', label: 'People', icon: Users },
    { to: '/admin/academics', label: 'Academics', icon: Building2 },
    { to: '/admin/assignments', label: 'Teaching assignments', icon: ClipboardList },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/teacher/assessments', label: 'Assessments', icon: ClipboardCheck },
    { to: '/teacher/review', label: 'Review queue', icon: Inbox, counter: 'queue' },
    { to: '/teacher/bank', label: 'Question bank', icon: LibraryBig },
    { to: '/teacher/analytics', label: 'Class analytics', icon: BarChart3 },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/assessments', label: 'Assessments', icon: BookMarked },
    { to: '/student/results', label: 'Results', icon: FileClock },
    { to: '/student/progress', label: 'My progress', icon: GraduationCap },
  ],
}

const PORTAL_LABEL = { admin: 'Administration', teacher: 'Teaching workspace', student: 'Student space' }

const ROLE_LABEL = { admin: 'Administrator', faculty: 'Faculty', teacher: 'Faculty', hod: 'Head of department', student: 'Student' }

export function Logo({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
        <rect width="64" height="64" rx="14" fill="var(--brand)" />
        <path d="M18 34.5 27.5 44 46 23" fill="none" stroke="var(--brand-ink)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px]">GradeMaster</span>
    </span>
  )
}

export function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={cn('grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink', className)}>
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-[10px] p-1 pr-2 hover:bg-surface-2">
        <Avatar name={user.name} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-36 truncate text-[13px] font-medium">{user.name}</span>
          <span className="block text-[11.5px] text-ink-3">{ROLE_LABEL[user.role] || user.role}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="animate-pop card absolute right-0 top-11 z-40 w-56 p-1 shadow-pop">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-ink-3">{user.email}</p>
          </div>
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2">
            <KeyRound className="h-4 w-4 text-ink-3" />Account & password
          </Link>
          <button role="menuitem" onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-bad hover:bg-bad-soft">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppShell({ portal }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => setDrawer(false), [location.pathname])
  const items = NAV[portal]

  const handleLogout = () => { logout(); navigate('/login') }

  // Live counters on the nav (refreshed on navigation): items waiting for the user's attention.
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let alive = true
    const load = portal === 'teacher' ? api.teacher.queue().then((q) => ({ queue: q.total }))
      : portal === 'admin' ? api.admin.overview().then((o) => ({ approvals: o.pending_approvals })) : null
    load?.then((c) => alive && setCounts(c)).catch(() => {})
    return () => { alive = false }
  }, [portal, location.pathname])

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3 pb-3" aria-label="Main">
      <p className="eyebrow px-3 pb-1.5 pt-2">{PORTAL_LABEL[portal]}</p>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end}
          className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors',
            isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
          {({ isActive }) => (<>
            {isActive && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand" aria-hidden />}
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors',
              isActive ? 'bg-brand text-brand-ink shadow-card' : 'bg-surface-2 text-ink-3 group-hover:text-ink')}>
              <it.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.counter && counts[it.counter] > 0 && (
              <span className="tabular min-w-5 rounded-full bg-warn px-1.5 text-center text-[11px] font-semibold leading-5 text-white"
                aria-label={`${counts[it.counter]} waiting`}>{counts[it.counter] > 99 ? '99+' : counts[it.counter]}</span>
            )}
          </>)}
        </NavLink>
      ))}
    </nav>
  )

  const profile = user && (
    <div className="m-3 space-y-3">
      <div className="rounded-xl border border-line bg-gradient-to-br from-brand-soft to-surface p-3 text-[12px] leading-relaxed text-ink-2">
        <span className="font-semibold text-brand">AI suggests, teachers decide.</span> Every grade is confirmed by a teacher before it counts.
      </div>
      <div className="flex items-center gap-2.5 rounded-xl px-1">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[11.5px] text-ink-3">{ROLE_LABEL[user.role] || user.role}</p>
        </div>
        <button onClick={handleLogout} aria-label="Sign out" title="Sign out"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-bad-soft hover:text-bad"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-15 items-center border-b border-line px-5"><Link to={items[0].to}><Logo /></Link></div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-2">{nav}</div>
        {profile}
      </aside>
      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-pop">
            <div className="flex h-15 items-center justify-between px-5">
              <Logo />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="p-1 text-ink-3"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">{nav}</div>
            {profile}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-15 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-6">
        <button className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="lg:hidden"><Logo /></div>
        <div className="flex-1" />
        <ThemeToggle />
        {user && <UserMenu user={user} onLogout={handleLogout} />}
      </header>
      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
