const BASE_URL = "http://localhost:8000"

const getHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }))
    const err = {
      status: response.status,
      message: error.detail || error.message || 'Request failed'
    }
    // Auto-logout on 401
    if (response.status === 401) {
      localStorage.removeItem('token')
      // Redirect to login if not already there
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
        window.location.href = '/login'
      }
    }
    throw err
  }
  return response.json()
}

// AUTH APIs
export const authAPI = {
  checkSetup: async () => {
    const response = await fetch(`${BASE_URL}/api/admin/check-setup`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  signup: async (data) => {
    const response = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  login: async (data) => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  me: async (token) => {
    const response = await fetch(`${BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },
}

// ADMIN APIs
export const adminAPI = {
  getDepartments: async (token) => {
    const response = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  createDepartment: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  getSections: async (token) => {
    const response = await fetch(`${BASE_URL}/api/admin/sections`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  createSection: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/admin/sections`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  getSubjects: async (token) => {
    const response = await fetch(`${BASE_URL}/api/admin/subjects`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  createSubject: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/admin/subjects`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  assignTeacher: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/admin/assign-teacher`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  getTeacherAssignments: async (token) => {
    const response = await fetch(`${BASE_URL}/api/admin/teacher-assignments`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getPendingUsers: async (token) => {
    const response = await fetch(`${BASE_URL}/api/admin/pending-users`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  approveUser: async (token, userId) => {
    const response = await fetch(`${BASE_URL}/api/admin/approve-user/${userId}`, {
      method: 'PUT',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },
}

// TEACHER APIs
export const teacherAPI = {
  getAssessments: async (token) => {
    const response = await fetch(`${BASE_URL}/api/teacher/assessments`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  createAssessment: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/teacher/assessments`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  getAssessment: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/assessments/${assessmentId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  evaluateSubmission: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/evaluate/${submissionId}`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  evaluateAssessment: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/evaluate-assessment/${assessmentId}`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  reviewSubmission: async (token, submissionId, data) => {
    const response = await fetch(`${BASE_URL}/api/teacher/review/${submissionId}`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  finalizeSubmission: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/finalize/${submissionId}`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getReviewHistory: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/review-history/${submissionId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getSubmission: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/submission/${submissionId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getAssessmentSubmissions: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/submissions/assessment/${assessmentId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getMcqSubmissionDetail: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/mcq-submission/${submissionId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getAssessmentStats: async (token) => {
    const response = await fetch(`${BASE_URL}/api/teacher/assessment-stats`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  // Manual submission review
  getManualSubmission: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/teacher/manual-submission/${submissionId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  reviewManualSubmission: async (token, submissionId, data) => {
    const response = await fetch(`${BASE_URL}/api/teacher/manual-submission/${submissionId}/review`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },
}

// STUDENT APIs
export const studentAPI = {
  getAssessments: async (token) => {
    const response = await fetch(`${BASE_URL}/api/student/assessments`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getAssessmentDetail: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/student/assessments/${assessmentId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getReviewQuestions: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/student/assessments/${assessmentId}/review-questions`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  submitMCQ: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/student/submit-mcq`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  submitCoding: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/student/submit-coding`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  getSubmissionStatus: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/student/submission-status/${assessmentId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getAllSubmissions: async (token) => {
    const response = await fetch(`${BASE_URL}/api/student/all-submissions`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getManualSubmissionDetail: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/student/manual-submission-detail/${assessmentId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getSubmission: async (token, submissionId) => {
    const response = await fetch(`${BASE_URL}/api/student/submission/${submissionId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  // Manual (Handwritten) Assignment APIs
  uploadHandwritten: async (token, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${BASE_URL}/api/student/upload-handwritten`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })
    return handleResponse(response)
  },

  processHandwritten: async (token, rawText, questions = null) => {
    const body = { raw_text: rawText }
    if (questions) body.questions = questions
    const response = await fetch(`${BASE_URL}/api/student/process-handwritten`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    })
    return handleResponse(response)
  },

  evaluateHandwritten: async (token, data) => {
    const response = await fetch(`${BASE_URL}/api/student/evaluate-handwritten`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },
}

// GENERAL APIs
export const generalAPI = {
  healthCheck: async () => {
    const response = await fetch(`${BASE_URL}/api/health`, {
      method: 'GET',
    })
    return handleResponse(response)
  },
}

// ANALYTICS APIs
export const analyticsAPI = {
  getTeacherDashboard: async (token) => {
    const response = await fetch(`${BASE_URL}/api/analytics/teacher-dashboard`, {
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  getStudentDashboard: async (token) => {
    const response = await fetch(`${BASE_URL}/api/analytics/student-dashboard`, {
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  downloadStudentReport: async (token, studentId) => {
    const response = await fetch(`${BASE_URL}/api/reports/student/${studentId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!response.ok) {
      throw { status: response.status, message: 'Failed to download report' }
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `student_report_${studentId.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  downloadAssessmentReport: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/reports/assessment/${assessmentId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!response.ok) {
      throw { status: response.status, message: 'Failed to download report' }
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `assessment_report_${assessmentId.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  getAssessmentReport: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/analytics/assessment-report/${assessmentId}`, {
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },

  regenerateAssessmentReport: async (token, assessmentId) => {
    const response = await fetch(`${BASE_URL}/api/analytics/assessment-report/${assessmentId}/regenerate`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    return handleResponse(response)
  },
}
