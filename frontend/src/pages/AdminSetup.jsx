import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, Eye, EyeOff, User, CheckCircle } from 'lucide-react'
import { useApp } from '../lib/context/AppContext'
import { authAPI } from '../lib/api'
import Button from '../components/Button'
import Input from '../components/Input'
import Card from '../components/Card'

export default function AdminSetup() {
  const navigate = useNavigate()
  const { addToast } = useApp()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!form.name || form.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
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
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      await authAPI.signup({
        name: form.name,
        email: form.email,
        password: form.password,
        role: 'admin',
      })
      setSuccess(true)
      addToast('Admin account created successfully!', 'success')
    } catch (error) {
      if (error.message === 'admin_exists' || error.message?.includes('admin')) {
        addToast('An admin account already exists. Please login.', 'warning')
        navigate('/login')
      } else {
        addToast(error.message || 'Failed to create admin account', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card>
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">Setup Complete!</h2>
              <p className="text-text-secondary mb-6">
                Your admin account has been created. You can now login and start configuring the platform.
              </p>
              <Button onClick={() => navigate('/login')} className="w-full">
                Go to Login
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Initial Setup</h1>
          <p className="text-text-secondary">
            Create the administrator account to get started with GradeMaster
          </p>
        </div>

        <Card>
          <div className="mb-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
            <h3 className="text-sm font-semibold text-primary mb-1">⚡ One-time setup</h3>
            <p className="text-xs text-text-secondary">
              Only one admin account can exist. This page will not be accessible after setup.
              The admin can create departments, sections, subjects, approve teachers, and manage the platform.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="Admin Name"
                type="text"
                placeholder="Enter admin name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={errors.name}
              />
              <User className="absolute right-4 top-9 w-5 h-5 text-text-secondary pointer-events-none" />
            </div>

            <div className="relative">
              <Input
                label="Admin Email"
                type="email"
                placeholder="Enter admin email"
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
                placeholder="Create a strong password"
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

            <Button type="submit" className="w-full" loading={loading}>
              <Shield className="w-4 h-4" />
              Create Admin Account
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
