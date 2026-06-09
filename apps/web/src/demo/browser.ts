import { setupWorker } from 'msw/browser'
import { libraryHandlers } from './handlers/library'
import { authHandlers } from './handlers/auth'
import { adminHandlers } from './handlers/admin'
import { webparserHandlers } from './handlers/webparser'

export const worker = setupWorker(
  ...libraryHandlers,
  ...authHandlers,
  ...adminHandlers,
  ...webparserHandlers,
)
