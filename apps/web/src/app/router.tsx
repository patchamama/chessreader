import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom'
import AppLayout from './AppLayout'
import LoginForm from '../features/auth/components/LoginForm'
import RegisterForm from '../features/auth/components/RegisterForm'
import RequireApproved from '../features/auth/guards/RequireApproved'
import RequireAdmin from '../features/auth/guards/RequireAdmin'
import PendingUsersTable from '../features/admin/components/PendingUsersTable'
import LibraryGrid from '../features/library/components/LibraryGrid'
import BookReader from '../features/library/components/BookReader'
import WebparserView from '../features/webparser/components/WebparserView'
import { isDemoHost } from '../shared/env/devMode'

function PendingPage() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg bg-white p-8 text-center shadow">
      <h1 className="text-xl font-bold">Account Pending</h1>
      <p className="mt-2 text-slate-600">
        Your account is awaiting admin approval.
      </p>
    </div>
  )
}

const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/library" replace /> },
      { path: '/login', element: <LoginForm /> },
      { path: '/register', element: <RegisterForm /> },
      { path: '/pending', element: <PendingPage /> },
      {
        path: '/library',
        element: (
          <RequireApproved>
            <LibraryGrid />
          </RequireApproved>
        ),
      },
      {
        path: '/read/:bookId',
        element: (
          <RequireApproved>
            <BookReader />
          </RequireApproved>
        ),
      },
      {
        path: '/webparser',
        element: (
          <RequireApproved>
            <WebparserView />
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
    ],
  },
]

// Hash router for GitHub Pages (no server-side routing); browser router everywhere else.
export const router = isDemoHost()
  ? createHashRouter(routes)
  : createBrowserRouter(routes)
