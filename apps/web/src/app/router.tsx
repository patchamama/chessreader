import { createBrowserRouter } from 'react-router-dom'
import LoginForm from '../features/auth/components/LoginForm'
import RegisterForm from '../features/auth/components/RegisterForm'
import RequireApproved from '../features/auth/guards/RequireApproved'
import RequireAdmin from '../features/auth/guards/RequireAdmin'
import PendingUsersTable from '../features/admin/components/PendingUsersTable'

function PendingPage() {
  return <div><h1>Account Pending</h1><p>Your account is awaiting admin approval.</p></div>
}

function LibraryPage() {
  return <div><h1>Library</h1></div>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginForm /> },
  { path: '/register', element: <RegisterForm /> },
  { path: '/pending', element: <PendingPage /> },
  {
    path: '/library',
    element: (
      <RequireApproved>
        <LibraryPage />
      </RequireApproved>
    ),
  },
  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <PendingUsersTable />
      </RequireAdmin>
    ),
  },
])
