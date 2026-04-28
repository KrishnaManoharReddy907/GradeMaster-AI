import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp, normalizeRoleForRoute } from './lib/context/AppContext'
import Toast from './components/Toast'
import Loader from './components/Loader'

// Public pages
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import AdminSetup from './pages/AdminSetup'

// Student pages
import StudentDashboard from './pages/student/StudentDashboard'
import StudentAssessments from './pages/student/Assessments'
import SolveMCQ from './pages/student/SolveMCQ'
import SolveCoding from './pages/student/SolveCoding'
import SolveManual from './pages/student/SolveManual'
import SubmissionStatus from './pages/student/SubmissionStatus'
import StudentSubmissionDetails from './pages/student/SubmissionDetails'
import StudentAnalytics from './pages/student/Analytics'
import QuestionReview from './pages/student/QuestionReview'

// Teacher pages
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import CreateAssessment from './pages/teacher/CreateAssessment'
import TeacherAssessments from './pages/teacher/AssessmentDetails'
import Submissions from './pages/teacher/Submissions'
import EvaluateSubmission from './pages/teacher/EvaluateSubmission'
import ReviewSubmission from './pages/teacher/ReviewSubmission'
import ReviewHistory from './pages/teacher/ReviewHistory'
import ManualReview from './pages/teacher/ManualReview'
import TeacherAnalytics from './pages/teacher/Analytics'
import AssessmentReport from './pages/teacher/AssessmentReport'
import MCQDetails from './pages/teacher/MCQDetails'

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard'
import Departments from './pages/admin/Departments'
import Sections from './pages/admin/Sections'
import Subjects from './pages/admin/Subjects'
import AssignTeacher from './pages/admin/AssignTeacher'
import PendingUsers from './pages/admin/PendingUsers'

// Layout
import DashboardLayout from './components/DashboardLayout'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const route = normalizeRoleForRoute(user.role)
    return <Navigate to={`/${route}`} replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader size="lg" />
      </div>
    )
  }

  if (user) {
    const route = normalizeRoleForRoute(user.role)
    return <Navigate to={`/${route}`} replace />
  }

  return children
}

export default function App() {
  const { toasts, removeToast } = useApp()

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/setup" element={<PublicRoute><AdminSetup /></PublicRoute>} />

        {/* Student routes */}
        <Route path="/student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<StudentDashboard />} />
          <Route path="assessments" element={<StudentAssessments />} />
          <Route path="assessments/:id/mcq" element={<SolveMCQ />} />
          <Route path="assessments/:id/coding" element={<SolveCoding />} />
          <Route path="assessments/:id/manual" element={<SolveManual />} />
          <Route path="submissions" element={<SubmissionStatus />} />
          <Route path="submissions/:id" element={<StudentSubmissionDetails />} />
          <Route path="assessments/:id/review-questions" element={<QuestionReview />} />
          <Route path="analytics" element={<StudentAnalytics />} />
        </Route>

        {/* Teacher routes - allow both 'teacher' and 'faculty' roles */}
        <Route path="/teacher" element={
          <ProtectedRoute allowedRoles={['teacher', 'faculty', 'hod']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<TeacherDashboard />} />
          <Route path="create-assessment" element={<CreateAssessment />} />
          <Route path="assessments" element={<TeacherAssessments />} />
          <Route path="assessments/:id/submissions" element={<Submissions />} />
          <Route path="submissions/:id/evaluate" element={<EvaluateSubmission />} />
          <Route path="submissions/:id/review" element={<ReviewSubmission />} />
          <Route path="submissions/:id/history" element={<ReviewHistory />} />
          <Route path="submissions/:id/mcq-details" element={<MCQDetails />} />
          <Route path="manual-submissions/:id/review" element={<ManualReview />} />
          <Route path="assessments/:id/report" element={<AssessmentReport />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="departments" element={<Departments />} />
          <Route path="sections" element={<Sections />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="assign-teacher" element={<AssignTeacher />} />
          <Route path="pending-users" element={<PendingUsers />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </>
  )
}
