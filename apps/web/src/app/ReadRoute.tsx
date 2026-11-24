import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { openBookTab, openExternalTab } from '../features/library/analysis/readerTabs'
import { EXTERNAL_BOOK_ID } from '../shared/externalBook/externalBookStore'

/**
 * /read/:bookId: every opener keeps linking here, but a book is read inside a
 * tab of the Analysis board page (S10), so this registers the tab, selects it
 * and moves there, keeping the opener's search string and state.
 */
export default function ReadRoute() {
  const { bookId } = useParams<{ bookId: string }>()
  const { search, state } = useLocation()
  const id = Number(bookId)
  const valid = Number.isFinite(id)
  useEffect(() => {
    if (!valid) return
    // A game or study opened from outside is a tab of its own each time, never the same board again.
    if (id === EXTERNAL_BOOK_ID) openExternalTab()
    else openBookTab(id)
  }, [valid, id])
  return <Navigate to={valid ? { pathname: '/analysis', search } : '/library'} replace state={state} />
}
