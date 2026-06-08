import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import RequireApproved from '../guards/RequireApproved'
import RequireAdmin from '../guards/RequireAdmin'

describe('RequireApproved', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
  })

  it('redirects pending user to /pending', () => {
    useAuthStore.setState({
      token: 'tok',
      user: { email: 'a@b.com', role: 'user', status: 'pending' },
    })

    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<RequireApproved><div>Library</div></RequireApproved>} />
          <Route path="/pending" element={<div>Pending Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Pending Page')).toBeInTheDocument()
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
  })

  it('renders children for approved user', () => {
    useAuthStore.setState({
      token: 'tok',
      user: { email: 'a@b.com', role: 'user', status: 'approved' },
    })

    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<RequireApproved><div>Library</div></RequireApproved>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Library')).toBeInTheDocument()
  })
})

describe('RequireAdmin', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
  })

  it('redirects non-admin to /login', () => {
    useAuthStore.setState({
      token: 'tok',
      user: { email: 'a@b.com', role: 'user', status: 'approved' },
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireAdmin><div>Admin Panel</div></RequireAdmin>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('renders children for admin user', () => {
    useAuthStore.setState({
      token: 'tok',
      user: { email: 'admin@b.com', role: 'admin', status: 'approved' },
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireAdmin><div>Admin Panel</div></RequireAdmin>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })
})
