import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, Presentation } from 'lucide-react'
import AuthLayout from './AuthLayout'
import { Button, Callout, Field, Input, Select } from '@/components/ui'
import { api } from '@/lib/api'
import { useAsync, useDocumentTitle } from '@/lib/hooks'
import { useToast } from '@/lib/ui-state'
import { cn } from '@/lib/utils'

function passwordIssue(p) {
  if (p.length < 8) return 'At least 8 characters'
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Use letters and at least one number'
  return null
}

export default function Signup() {
  useDocumentTitle('Create account')
  const navigate = useNavigate()
  const toast = useToast()
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({ name: '', email: '', password: '', department_id: '', year: '', section_id: '' })
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const options = useAsync(() => api.auth.signupOptions(), [])
  const sections = options.data?.sections || []
  const deptSections = sections.filter((s) => s.department_id === form.department_id)
  const years = [...new Set(deptSections.map((s) => s.year).filter(Boolean))].sort()
  const yearSections = deptSections.filter((s) => String(s.year) === String(form.year))
  const noCatalog = options.data && !options.data.departments.length
  const pwIssue = passwordIssue(form.password)

  const valid = useMemo(() => form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && !pwIssue &&
    (role !== 'student' || (form.department_id && form.year && form.section_id)), [form, role, pwIssue])

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    setError(null)
    setPending(true)
    try {
      const body = { name: form.name, email: form.email, password: form.password, role }
      if (role === 'student') Object.assign(body, { department_id: form.department_id, section_id: form.section_id, year: Number(form.year) })
      const res = await api.auth.signup(body)
      toast.success(res.message, 'Account created')
      navigate('/login')
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Students and faculty can sign up. Administrators create other staff accounts."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am a">
          {[{ v: 'student', label: 'Student', icon: GraduationCap }, { v: 'faculty', label: 'Faculty', icon: Presentation }].map((o) => (
            <button type="button" key={o.v} role="radio" aria-checked={role === o.v} onClick={() => setRole(o.v)}
              className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                role === o.v ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:bg-surface-2')}>
              <o.icon className="h-4 w-4" />{o.label}
            </button>
          ))}
        </div>
        {error && <Callout tone="bad">{error.message}</Callout>}
        <Field label="Full name" error={touched && form.name.trim().length < 2 ? 'Enter your name' : null}>
          {({ id, invalid }) => <Input id={id} invalid={invalid} autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={touched && !/\S+@\S+\.\S+/.test(form.email) ? 'Enter a valid email' : null}>
          {({ id, invalid }) => <Input id={id} invalid={invalid} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" hint="At least 8 characters with letters and a number." error={(touched || form.password) && pwIssue ? pwIssue : null}>
          {({ id, invalid }) => <Input id={id} invalid={invalid && touched} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        {role === 'student' ? (
          noCatalog ? <Callout tone="warn">Your institution has not set up departments and sections yet. Please check back later.</Callout>
            : options.error ? <Callout tone="bad">Could not load departments. {options.error.message}</Callout> : (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Department" className="col-span-3" error={touched && !form.department_id ? 'Required' : null}>
              {({ id, invalid }) => (
                <Select id={id} invalid={invalid} value={form.department_id} disabled={options.loading}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value, year: '', section_id: '' })}>
                  <option value="">{options.loading ? 'Loading…' : 'Select your department'}</option>
                  {(options.data?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Year" className="col-span-1" error={touched && !form.year ? 'Required' : null}>
              {({ id, invalid }) => (
                <Select id={id} invalid={invalid} value={form.year} disabled={!form.department_id}
                  onChange={(e) => setForm({ ...form, year: e.target.value, section_id: '' })}>
                  <option value="">—</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Section" className="col-span-2" error={touched && !form.section_id ? 'Required' : null}>
              {({ id, invalid }) => (
                <Select id={id} invalid={invalid} value={form.section_id} disabled={!form.year} onChange={set('section_id')}>
                  <option value="">{form.year ? 'Select your section' : 'Choose a year first'}</option>
                  {yearSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          )
        ) : (
          <Callout tone="info">Faculty accounts are reviewed by an administrator. You can sign in once approved.</Callout>
        )}
        <Button type="submit" size="lg" className="w-full" loading={pending}>Create account</Button>
      </form>
    </AuthLayout>
  )
}
