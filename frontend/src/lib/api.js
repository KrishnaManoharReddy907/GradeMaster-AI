/**
 * API client. One place for base URL, auth header, error normalisation and the
 * 401 → sign-in redirect. Pages call the typed helpers at the bottom.
 */

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'gm-token'

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } },
}

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

async function request(method, path, { body, query, form, raw, signal } = {}) {
  const url = new URL(API_URL + path)
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    })
  }
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(url, { method, headers, body: payload, signal })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'network')
  }

  if (res.status === 401 && token) {
    tokenStore.clear()
    onUnauthorized()
  }
  if (!res.ok) {
    let data = {}
    try { data = await res.json() } catch { /* non-JSON error */ }
    const message = typeof data.detail === 'string' ? data.detail
      : res.status === 429 ? 'Too many requests. Please wait a moment.'
      : res.status >= 500 ? 'Something went wrong on the server. Please try again.'
      : 'Request failed'
    throw new ApiError(res.status, message, data.code, data.errors)
  }
  if (raw) return res
  if (res.status === 204) return null
  return res.json()
}

const get = (p, query, opts) => request('GET', p, { query, ...opts })
const post = (p, body, opts) => request('POST', p, { body, ...opts })
const put = (p, body) => request('PUT', p, { body })
const patch = (p, body) => request('PATCH', p, { body })
const del = (p) => request('DELETE', p)

export async function downloadFile(path, fallbackName) {
  const res = await request('GET', path, { raw: true })
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] || fallbackName
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function fetchBlobUrl(path) {
  const res = await request('GET', path, { raw: true })
  return URL.createObjectURL(await res.blob())
}

export const api = {
  auth: {
    login: (email, password) => post('/api/auth/login', { email, password }),
    signup: (data) => post('/api/auth/signup', data),
    signupOptions: () => get('/api/auth/signup-options'),
    me: () => get('/api/auth/me'),
    bootstrapAdmin: (data) => post('/api/auth/bootstrap-admin', data),
    changePassword: (current_password, password) => post('/api/auth/change-password', { current_password, password }),
    checkSetup: () => get('/api/admin/check-setup'),
  },
  catalog: {
    departments: () => get('/api/admin/departments'),
    sections: () => get('/api/admin/sections'),
    subjects: () => get('/api/admin/subjects'),
  },
  admin: {
    overview: () => get('/api/admin/overview'),
    health: () => get('/api/admin/system-health'),
    createDepartment: (data) => post('/api/admin/departments', data),
    createSection: (data) => post('/api/admin/sections', data),
    createSubject: (data) => post('/api/admin/subjects', data),
    setTopics: (id, topics) => put(`/api/admin/subjects/${id}/topics`, { topics }),
    assignments: () => get('/api/admin/teacher-assignments'),
    assign: (data) => post('/api/admin/assign-teacher', data),
    removeAssignment: (id) => del(`/api/admin/teacher-assignments/${id}`),
    approvedTeachers: () => get('/api/admin/approved-teachers'),
    pending: () => get('/api/admin/pending-users'),
    approve: (id) => put(`/api/admin/approve-user/${id}`),
    reject: (id) => put(`/api/admin/reject-user/${id}`),
    users: (q) => get('/api/admin/users', q),
    createStaff: (data) => post('/api/admin/staff', data),
    setActive: (id, is_active) => put(`/api/admin/users/${id}/status`, { is_active }),
    audit: (q) => get('/api/admin/audit-log', q),
  },
  teacher: {
    myAssignments: () => get('/api/teacher/my-assignments'),
    assessments: () => get('/api/teacher/assessments'),
    assessment: (id) => get(`/api/teacher/assessments/${id}`),
    createAssessment: (data) => post('/api/teacher/assessments', data),
    updateAssessment: (id, data) => patch(`/api/teacher/assessments/${id}`, data),
    deleteAssessment: (id) => del(`/api/teacher/assessments/${id}`),
    stats: () => get('/api/teacher/assessment-stats'),
    submissions: (id) => get(`/api/teacher/submissions/assessment/${id}`),
    evaluate: (id) => post(`/api/teacher/evaluate/${id}`),
    evaluateAll: (id) => post(`/api/teacher/evaluate-assessment/${id}`),
    finalizeAllCoding: (id) => post(`/api/teacher/assessments/${id}/finalize-coding`),
    job: (id) => get(`/api/teacher/jobs/${id}`),
    coding: (id) => get(`/api/teacher/submission/${id}`),
    review: (id, final_score, teacher_feedback) => post(`/api/teacher/review/${id}`, { final_score, teacher_feedback }),
    finalize: (id) => post(`/api/teacher/finalize/${id}`),
    mcq: (id) => get(`/api/teacher/mcq-submission/${id}`),
    manual: (id) => get(`/api/teacher/manual-submission/${id}`),
    reviewManual: (id, data) => put(`/api/teacher/manual-submission/${id}/review`, data),
    reEvaluateManual: (id) => post(`/api/teacher/manual-submission/${id}/re-evaluate`),
    queue: () => get('/api/teacher/review-queue'),
    plagiarism: (id) => get(`/api/teacher/assessments/${id}/plagiarism`),
    compare: (a, b) => get('/api/teacher/plagiarism/compare', { a, b }),
    bank: (q) => get('/api/teacher/question-bank', q),
    addToBank: (data) => post('/api/teacher/question-bank', data),
    removeFromBank: (id) => del(`/api/teacher/question-bank/${id}`),
    importToBank: (assessmentId) => post(`/api/teacher/question-bank/import/${assessmentId}`),
    markBankUsed: (ids) => post('/api/teacher/question-bank/mark-used', { ids }),
    generate: (data) => post('/api/teacher/ai/generate-questions', data),
    uploadUrl: (fileId) => `/api/teacher/uploads/${fileId}`,
  },
  student: {
    assessments: () => get('/api/student/assessments'),
    assessment: (id) => get(`/api/student/assessments/${id}`),
    start: (id) => post(`/api/student/assessments/${id}/start`),
    proctorEvent: (id, type) => post(`/api/student/assessments/${id}/proctor-event`, { type }),
    paper: (id) => get(`/api/student/assessments/${id}/review-questions`),
    submitMcq: (assessment_id, answers) => post('/api/student/submit-mcq', { assessment_id, answers }),
    submitCode: (data) => post('/api/student/submit-coding', data),
    status: (id) => get(`/api/student/submission-status/${id}`),
    submissions: () => get('/api/student/all-submissions'),
    manualResult: (id) => get(`/api/student/manual-submission-detail/${id}`),
    uploadHandwritten: (file, assessmentId) => {
      const form = new FormData()
      form.append('file', file)
      if (assessmentId) form.append('assessment_id', assessmentId)
      return request('POST', '/api/student/upload-handwritten', { form })
    },
    processHandwritten: (raw_text, assessment_id) => post('/api/student/process-handwritten', { raw_text, assessment_id }),
    submitHandwritten: (data) => post('/api/student/evaluate-handwritten', data),
  },
  analytics: {
    teacher: (assessment_id) => get('/api/analytics/teacher-dashboard', { assessment_id }),
    student: () => get('/api/analytics/student-dashboard'),
    studentProfile: (id) => get(`/api/analytics/students/${id}`),
    report: (id) => get(`/api/analytics/assessment-report/${id}`),
    regenerate: (id) => post(`/api/analytics/assessment-report/${id}/regenerate`),
    downloadStudentPdf: (id) => downloadFile(`/api/reports/student/${id}`, 'student-report.pdf'),
    downloadAssessmentPdf: (id) => downloadFile(`/api/reports/assessment/${id}`, 'assessment-report.pdf'),
  },
}
