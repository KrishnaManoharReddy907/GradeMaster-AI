import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api'

const AppContext = createContext(null)

// Helper to normalize role for routing
// Backend uses 'faculty' but frontend routes use '/teacher'
export function normalizeRoleForRoute(role) {
  if (role === 'faculty' || role === 'hod') return 'teacher'
  return role
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'dark')

  // Apply theme class on mount and change
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  // Data stores
  const [departments, setDepartments] = useState([])
  const [sections, setSections] = useState([])
  const [subjects, setSubjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [selectedSubmission, setSelectedSubmission] = useState(null)

  // Toast functions
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Auth functions
  const login = useCallback(async (newToken, role) => {
    localStorage.setItem('token', newToken)
    if (role) localStorage.setItem('role', role)
    setToken(newToken)
    try {
      const userData = await authAPI.me(newToken)
      setUser(userData)
      return userData
    } catch (error) {
      logout()
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    setToken(null)
    setUser(null)
    setDepartments([])
    setSections([])
    setSubjects([])
    setAssignments([])
    setSubmissions([])
    setSelectedSubmission(null)
  }, [])

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await authAPI.me(token)
          setUser(userData)
        } catch (error) {
          console.error('Auth initialization failed:', error)
          logout()
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [token, logout])

  const value = {
    // Auth
    token,
    user,
    loading,
    login,
    logout,
    
    // Theme
    theme,
    toggleTheme,
    
    // Toast
    toasts,
    addToast,
    removeToast,
    
    // Data stores
    departments,
    setDepartments,
    sections,
    setSections,
    subjects,
    setSubjects,
    assignments,
    setAssignments,
    submissions,
    setSubmissions,
    selectedSubmission,
    setSelectedSubmission,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
