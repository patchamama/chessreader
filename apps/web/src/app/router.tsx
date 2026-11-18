import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom'
import AppLayout from './AppLayout'
import LoginForm from '../features/auth/components/LoginForm'
import RegisterForm from '../features/auth/components/RegisterForm'
import RequireApproved from '../features/auth/guards/RequireApproved'
import RequireAdmin from '../features/auth/guards/RequireAdmin'
import AdminPage from '../features/admin/components/AdminPage'
import LibraryGrid from '../features/library/components/LibraryGrid'
import ResetPasswordPage from '../features/auth/components/ResetPasswordPage'
import BookReader from '../features/library/components/BookReader'
import WebparserView from '../features/webparser/components/WebparserView'
import GameSearchPage from '../features/gamesearch/GameSearchPage'
import PlayPage from '../features/play/PlayPage'
import TrainingPage from '../features/training/TrainingPage'
import DatabasePage from '../features/database/DatabasePage'
import ErrorsPage from '../features/errors/ErrorsPage'
import { isDemoHost } from '../shared/env/devMode'
import PendingPage from '../features/auth/components/PendingPage'

const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/library" replace /> },
      { path: '/login', element: <LoginForm /> },
      { path: '/register', element: <RegisterForm /> },
      { path: '/pending', element: <PendingPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
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
        path: '/search',
        element: (
          <RequireApproved>
            <GameSearchPage />
          </RequireApproved>
        ),
      },
      {
        path: '/errors',
        element: (
          <RequireApproved>
            <ErrorsPage />
          </RequireApproved>
        ),
      },
      {
        path: '/database',
        element: (
          <RequireApproved>
            <DatabasePage />
          </RequireApproved>
        ),
      },
      {
        path: '/training',
        element: (
          <RequireApproved>
            <TrainingPage />
          </RequireApproved>
        ),
      },
      {
        path: '/play',
        element: (
          <RequireApproved>
            <PlayPage />
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
            <AdminPage />
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
