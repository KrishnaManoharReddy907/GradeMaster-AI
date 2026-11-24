import { Navigate, useLocation } from 'react-router-dom'
import { PageSkeleton } from './ui'
import { homeFor, useAuth } from '@/lib/auth'

/** Signed-in users with one of `roles` (any role when omitted); others go to sign-in or their own home. */
export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="p-8"><PageSkeleton /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return children
}

/** Sign-in / sign-up pages: signed-in users are sent to their home. */
export function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to={homeFor(user.role)} replace /> : children
}
