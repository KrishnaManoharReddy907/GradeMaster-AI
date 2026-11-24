import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PublicOnly, RequireRole } from './guards'

const authState = { user: null, loading: false }
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig()), useAuth: () => authState }))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<PublicOnly><p>login page</p></PublicOnly>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><p>admin home</p></RequireRole>} />
        <Route path="/teacher" element={<RequireRole roles={['faculty', 'teacher', 'hod']}><p>teacher home</p></RequireRole>} />
        <Route path="/student" element={<RequireRole roles={['student']}><p>student home</p></RequireRole>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('route guards', () => {
  it('sends signed-out visitors to sign-in', () => {
    Object.assign(authState, { user: null, loading: false })
    renderAt('/admin')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('keeps a student out of the admin portal', () => {
    Object.assign(authState, { user: { role: 'student' }, loading: false })
    renderAt('/admin')
    expect(screen.getByText('student home')).toBeInTheDocument()
    expect(screen.queryByText('admin home')).not.toBeInTheDocument()
  })

  it('routes faculty to the teacher portal and lets admins in', () => {
    Object.assign(authState, { user: { role: 'faculty' }, loading: false })
    renderAt('/admin')
    expect(screen.getByText('teacher home')).toBeInTheDocument()
    Object.assign(authState, { user: { role: 'admin' } })
    renderAt('/admin')
    expect(screen.getAllByText('admin home').length).toBeGreaterThan(0)
  })

  it('redirects signed-in users away from sign-in', () => {
    Object.assign(authState, { user: { role: 'student' }, loading: false })
    renderAt('/login')
    expect(screen.getByText('student home')).toBeInTheDocument()
  })

  it('renders nothing protected while the session is loading', () => {
    Object.assign(authState, { user: null, loading: true })
    renderAt('/admin')
    expect(screen.queryByText('admin home')).not.toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })
})
