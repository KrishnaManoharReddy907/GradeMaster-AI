import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, CardHeader, Field, Input, KeyValue, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'

export default function Account() {
  useDocumentTitle('Account')
  const { user, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [pending, setPending] = useState(false)
  const mismatch = form.confirm && form.confirm !== form.next

  const submit = async (e) => {
    e.preventDefault()
    if (mismatch) return
    setPending(true)
    try {
      await api.auth.changePassword(form.current, form.next)
      toast.success('Password changed. Please sign in again.')
      logout()
      navigate('/login')
    } catch (err) {
      toast.error(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Account" description="Your profile and sign-in settings." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <KeyValue items={[['Name', user.name], ['Email', user.email], ['Role', user.role], user.year ? ['Year', user.year] : null]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" description="Changing your password signs you out on every device." />
          <CardBody>
            <form onSubmit={submit} className="grid max-w-md gap-4">
              <Field label="Current password">{({ id }) => <Input id={id} type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />}</Field>
              <Field label="New password" hint="At least 8 characters with letters and a number.">{({ id }) => <Input id={id} type="password" autoComplete="new-password" required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />}</Field>
              <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : null}>{({ id, invalid }) => <Input id={id} invalid={invalid} type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}</Field>
              <div><Button type="submit" loading={pending}>Update password</Button></div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
