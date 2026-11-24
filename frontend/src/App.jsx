import { Component, lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { Button, PageSkeleton } from './components/ui'
import { RequireRole, PublicOnly } from './components/guards'
import { STAFF_ROLES, useAuth } from './lib/auth'

const page = (loader) => lazy(loader)

// Public
const Landing = page(() => import('./pages/public/Landing'))
const Login = page(() => import('./pages/public/Login'))
const Signup = page(() => import('./pages/public/Signup'))
const Setup = page(() => import('./pages/public/Setup'))
const Account = page(() => import('./pages/shared/Account'))
const NotFound = page(() => import('./pages/shared/NotFound'))
// Admin
const AdminOverview = page(() => import('./pages/admin/Overview'))
const AdminApprovals = page(() => import('./pages/admin/Approvals'))
const AdminUsers = page(() => import('./pages/admin/Users'))
const AdminAcademics = page(() => import('./pages/admin/Academics'))
const AdminAssignments = page(() => import('./pages/admin/Assignments'))
const AdminAudit = page(() => import('./pages/admin/Audit'))
// Teacher
const TeacherDashboard = page(() => import('./pages/teacher/Dashboard'))
const TeacherAssessments = page(() => import('./pages/teacher/Assessments'))
const AssessmentBuilder = page(() => import('./pages/teacher/builder/AssessmentBuilder'))
const AssessmentWorkspace = page(() => import('./pages/teacher/AssessmentWorkspace'))
const CodingReview = page(() => import('./pages/teacher/CodingReview'))
const ManualReview = page(() => import('./pages/teacher/ManualReview'))
const McqSubmission = page(() => import('./pages/teacher/McqSubmission'))
const PlagiarismCompare = page(() => import('./pages/teacher/PlagiarismCompare'))
const ReviewQueue = page(() => import('./pages/teacher/ReviewQueue'))
const QuestionBank = page(() => import('./pages/teacher/QuestionBank'))
const ClassAnalytics = page(() => import('./pages/teacher/ClassAnalytics'))
const StudentProfile = page(() => import('./pages/teacher/StudentProfile'))
const AssessmentReport = page(() => import('./pages/teacher/AssessmentReport'))
// Student
const StudentDashboard = page(() => import('./pages/student/Dashboard'))
const StudentAssessments = page(() => import('./pages/student/Assessments'))
const TakeMcq = page(() => import('./pages/student/TakeMcq'))
const TakeCoding = page(() => import('./pages/student/TakeCoding'))
const TakeHandwritten = page(() => import('./pages/student/TakeHandwritten'))
const Results = page(() => import('./pages/student/Results'))
const ResultDetail = page(() => import('./pages/student/ResultDetail'))
const ReleasedPaper = page(() => import('./pages/student/ReleasedPaper'))
const Progress = page(() => import('./pages/student/Progress'))

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(error, info) }
  render() {
    if (!this.state.error) return this.props.children
    const chunk = /Loading chunk|dynamically imported module/i.test(String(this.state.error?.message))
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">{chunk ? 'A new version is available' : 'Something went wrong'}</p>
          <p className="mt-1 text-ink-3">{chunk ? 'Reload to get the latest version.' : 'The error has been logged. Reloading usually helps.'}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}

const STAFF = [...STAFF_ROLES, 'admin']

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
          <Route path="/setup" element={<PublicOnly><Setup /></PublicOnly>} />

          <Route element={<RequireRole roles={['admin']}><AppShell portal="admin" /></RequireRole>}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/approvals" element={<AdminApprovals />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/academics" element={<AdminAcademics />} />
            <Route path="/admin/assignments" element={<AdminAssignments />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
          </Route>

          <Route element={<RequireRole roles={STAFF}><AppShell portal="teacher" /></RequireRole>}>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/assessments" element={<TeacherAssessments />} />
            <Route path="/teacher/assessments/new" element={<AssessmentBuilder />} />
            <Route path="/teacher/assessments/:id" element={<AssessmentWorkspace />} />
            <Route path="/teacher/assessments/:id/report" element={<AssessmentReport />} />
            <Route path="/teacher/coding/:id" element={<CodingReview />} />
            <Route path="/teacher/manual/:id" element={<ManualReview />} />
            <Route path="/teacher/mcq/:id" element={<McqSubmission />} />
            <Route path="/teacher/plagiarism" element={<PlagiarismCompare />} />
            <Route path="/teacher/review" element={<ReviewQueue />} />
            <Route path="/teacher/bank" element={<QuestionBank />} />
            <Route path="/teacher/analytics" element={<ClassAnalytics />} />
            <Route path="/teacher/students/:id" element={<StudentProfile />} />
          </Route>

          <Route element={<RequireRole roles={['student']}><AppShell portal="student" /></RequireRole>}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/assessments" element={<StudentAssessments />} />
            <Route path="/student/results" element={<Results />} />
            <Route path="/student/results/:id" element={<ResultDetail />} />
            <Route path="/student/paper/:id" element={<ReleasedPaper />} />
            <Route path="/student/progress" element={<Progress />} />
          </Route>

          {/* Exam screens: full-screen, no navigation chrome. */}
          <Route path="/student/take/mcq/:id" element={<RequireRole roles={['student']}><TakeMcq /></RequireRole>} />
          <Route path="/student/take/coding/:id" element={<RequireRole roles={['student']}><TakeCoding /></RequireRole>} />
          <Route path="/student/take/handwritten/:id" element={<RequireRole roles={['student']}><TakeHandwritten /></RequireRole>} />

          <Route path="/account" element={<RequireRole><AccountShell /></RequireRole>}>
            <Route index element={<Account />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function AccountShell() {
  const { user } = useAuth()
  const portal = user.role === 'admin' ? 'admin' : user.role === 'student' ? 'student' : 'teacher'
  return <AppShell portal={portal} />
}
