import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, Mail, Lock, Eye, EyeOff, User, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/context/AppContext'
import { authAPI } from '../lib/api'
import Button from '../components/Button'
import Input, { Select } from '../components/Input'
import Card from '../components/Card'

export default function Signup() {
  const navigate = useNavigate()
  const { addToast } = useApp()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    // Student-specific fields
    department_name: '',
    year: '',
    section_name: '',
  })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!form.name) {
      newErrors.name = 'Name is required'
    }
    if (!form.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = 'Invalid email format'
    }
    if (!form.password) {
      newErrors.password = 'Password is required'
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }
    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    // Student-specific validation
    if (form.role === 'student') {
      if (!form.department_name) {
        newErrors.department_name = 'Department is required for students'
      }
      if (!form.year) {
        newErrors.year = 'Year is required for students'
      }
      if (!form.section_name) {
        newErrors.section_name = 'Section is required for students'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
      }

      // Add student-specific fields
      if (form.role === 'student') {
        payload.department_name = form.department_name
        payload.year = parseInt(form.year)
        payload.section_name = form.section_name
      }

      // Add faculty department
      if (form.role === 'faculty') {
        if (form.department_name) {
          payload.department_name = form.department_name
        }
      }

      await authAPI.signup(payload)
      
      if (form.role === 'faculty') {
        addToast('Account created! Awaiting admin approval.', 'success')
      } else {
        addToast('Account created successfully!', 'success')
      }
      navigate('/login')
    } catch (error) {
      if (error.status === 400) {
        addToast(error.message || 'Registration failed', 'error')
      } else {
        addToast(error.message || 'Signup failed', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-text-primary">GradeMaster</span>
          </Link>
        </div>

        <Card>
          <h1 className="text-2xl font-bold text-text-primary text-center mb-2">
            Create account
          </h1>
          <p className="text-text-secondary text-center mb-6">
            Get started with GradeMaster
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="Full Name"
                type="text"
                placeholder="Enter your full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={errors.name}
              />
              <User className="absolute right-4 top-9 w-5 h-5 text-text-secondary pointer-events-none" />
            </div>

            <div className="relative">
              <Input
                label="Email"
                type="email"
                placeholder="Enter your email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={errors.email}
              />
              <Mail className="absolute right-4 top-9 w-5 h-5 text-text-secondary pointer-events-none" />
            </div>

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                error={errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-9 text-text-secondary hover:text-text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="relative">
              <Input
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                error={errors.confirmPassword}
              />
              <Lock className="absolute right-4 top-9 w-5 h-5 text-text-secondary pointer-events-none" />
            </div>

            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty / Teacher</option>
            </Select>

            {/* Student-specific fields */}
            {form.role === 'student' && (
              <div className="space-y-4 p-4 bg-background rounded-xl border border-border">
                <p className="text-sm font-medium text-text-secondary">Student Details</p>
                <Input
                  label="Department"
                  type="text"
                  placeholder="e.g., Computer Science and Engineering"
                  value={form.department_name}
                  onChange={(e) => setForm({ ...form, department_name: e.target.value })}
                  error={errors.department_name}
                />
                <Select
                  label="Year"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  error={errors.year}
                >
                  <option value="">Select year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </Select>
                <Input
                  label="Section"
                  type="text"
                  placeholder="e.g., A"
                  value={form.section_name}
                  onChange={(e) => setForm({ ...form, section_name: e.target.value })}
                  error={errors.section_name}
                />
              </div>
            )}

            {form.role === 'faculty' && (
              <div className="space-y-4 p-4 bg-background rounded-xl border border-border">
                <p className="text-sm font-medium text-text-secondary">Faculty Details</p>
                <Input
                  label="Department"
                  type="text"
                  placeholder="e.g., Computer Science and Engineering"
                  value={form.department_name}
                  onChange={(e) => setForm({ ...form, department_name: e.target.value })}
                />
                <div className="flex items-start gap-3 p-3 bg-warning/10 rounded-xl text-warning">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">
                    Faculty accounts require admin approval before you can access the platform.
                  </p>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-text-secondary text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
