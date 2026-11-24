import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { homeFor, useAuth } from '@/lib/auth'

export default function NotFound() {
  const { user } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page doesn’t exist</h1>
        <p className="mt-1 text-ink-3">The link may be broken or the page may have moved.</p>
        <Link to={user ? homeFor(user.role) : '/'}><Button className="mt-6">Take me home</Button></Link>
      </div>
    </div>
  )
}
