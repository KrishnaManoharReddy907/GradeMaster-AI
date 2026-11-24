import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Hourglass } from 'lucide-react'
import AuthLayout from './AuthLayout'
import { Button, Callout, Field, Input } from '@/components/ui'
import { homeFor, useAuth } from '@/lib/auth'
import { useDocumentTitle } from '@/lib/hooks'

export default function Login() {
  useDocumentTitle('Sign in')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const me = await login(form.email.trim(), form.password)
      const from = location.state?.from
      navigate(from && from.startsWith(homeFor(me.role)) ? from : homeFor(me.role), { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to GradeMaster."
      footer={<>New here? <Link to="/signup" className="font-medium text-brand hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error?.code === 'pending_approval' ? (
          <Callout tone="warn" icon={Hourglass} title="Awaiting approval">
            Your faculty account has been created. An administrator needs to approve it before you can sign in.
          </Callout>
        ) : error ? <Callout tone="bad">{error.message}</Callout> : null}
        <Field label="Email">
          {({ id }) => <Input id={id} type="email" autoComplete="email" required autoFocus value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@college.edu" />}
        </Field>
        <Field label="Password">
          {({ id }) => (
            <div className="relative">
              <Input id={id} type={show ? 'text' : 'password'} autoComplete="current-password" required value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!form.email || !form.password}>Sign in</Button>
      </form>
    </AuthLayout>
  )
}
