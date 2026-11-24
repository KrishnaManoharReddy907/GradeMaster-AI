import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api'

const AuthContext = createContext(null)

export const STAFF_ROLES = ['faculty', 'teacher', 'hod']

/** Map a role to its portal root. */
export function homeFor(role) {
  if (role === 'admin') return '/admin'
  if (STAFF_ROLES.includes(role)) return '/teacher'
  return '/student'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.get()))

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!tokenStore.get()) return
    api.auth.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.auth.login(email, password)
    tokenStore.set(res.access_token)
    const me = await api.auth.me()
    setUser(me)
    return me
  }, [])

  const refresh = useCallback(async () => setUser(await api.auth.me()), [])

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
