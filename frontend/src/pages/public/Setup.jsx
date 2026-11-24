import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import AuthLayout from './AuthLayout'
import { Button, Callout, Field, Input } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'

export default function Setup() {
  useDocumentTitle('First-time setup')
  const navigate = useNavigate()
  const toast = useToast()
  const setup = useAsync(() => api.auth.checkSetup(), [])
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', token: '' })
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const mismatch = form.confirm && form.confirm !== form.password
  const tokenRequired = Boolean(setup.data?.token_required)

  const submit = async (e) => {
    e.preventDefault()
    if (mismatch) return
    setPending(true)
    setError(null)
    try {
      await api.auth.bootstrapAdmin({ name: form.name, email: form.email, password: form.password, ...(tokenRequired ? { setup_token: form.token.trim() } : {}) })
      toast.success('Administrator account created. Sign in to continue.')
      navigate('/login')
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  if (setup.data && !setup.data.setup_required) {
    return (
      <AuthLayout title="Setup is complete" subtitle="An administrator account already exists.">
        <Button className="w-full" size="lg" onClick={() => navigate('/login')}>Go to sign in</Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set up GradeMaster" subtitle="Create the administrator account. This is only possible once.">
      <form onSubmit={submit} className="space-y-4">
        <Callout tone="brand" icon={ShieldCheck}>The administrator manages departments, sections, subjects, staff and approvals.</Callout>
        {error && <Callout tone="bad">{error.message}</Callout>}
        {tokenRequired && (
          <Field label="Setup token" hint="The BOOTSTRAP_TOKEN value from the server's environment settings.">
            {({ id }) => <Input id={id} required autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />}
          </Field>
        )}
        <Field label="Full name">{({ id }) => <Input id={id} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Email">{({ id }) => <Input id={id} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Password" hint="At least 8 characters with letters and a number.">
          {({ id }) => <Input id={id} type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <Field label="Confirm password" error={mismatch ? 'Passwords do not match' : null}>
          {({ id, invalid }) => <Input id={id} invalid={invalid} type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>Create administrator</Button>
      </form>
    </AuthLayout>
  )
}
