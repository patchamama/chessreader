import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CommentRequestControl from './CommentRequestControl'
import * as api from './commentRequestApi'

vi.mock('./commentRequestApi', async (orig) => ({ ...(await orig<object>()), requestBookComments: vi.fn(), cancelBookCommentRequest: vi.fn() }))

const BOOK = { id: 7, title: 'B', language: 'en' }
const onChanged = vi.fn()
const renderIt = (props: Partial<React.ComponentProps<typeof CommentRequestControl>> = {}) =>
  render(<CommentRequestControl book={BOOK} state={null} onChanged={onChanged} {...props} />)
beforeEach(() => { vi.clearAllMocks() })

describe('CommentRequestControl', () => {
  it('shows the request button when there is no request', () => {
    renderIt()
    const b = screen.getByRole('button', { name: 'Request adding the comments of this book to the commentary database' })
    expect(b).toHaveAttribute('title', expect.stringMatching(/commentary database/i))
    expect(b).toHaveTextContent('Request its comments')
  })

  it('requests, then tells the list to refresh', async () => {
    vi.mocked(api.requestBookComments).mockResolvedValue({ saved: true, where: 'server', status: 'pending' })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /request adding the comments/i }))
    await waitFor(() => expect(api.requestBookComments).toHaveBeenCalledWith(BOOK, ''))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await screen.findByText(/Requested/)).toBeInTheDocument()
  })

  it('a double click sends one request', async () => {
    vi.mocked(api.requestBookComments).mockResolvedValue({ saved: true, where: 'server', status: 'pending' })
    renderIt()
    const b = screen.getByRole('button', { name: /request adding the comments/i })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(screen.getByText(/Requested/)).toBeInTheDocument())
    expect(api.requestBookComments).toHaveBeenCalledTimes(1)
  })

  it('pending: a chip with a cancel link', async () => {
    vi.mocked(api.cancelBookCommentRequest).mockResolvedValue()
    renderIt({ state: 'pending' })
    expect(screen.getByText('Requested ✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request adding/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(api.cancelBookCommentRequest).toHaveBeenCalledWith(7))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('done: the "Comments added" chip', () => {
    renderIt({ state: 'done' })
    expect(screen.getByText('Comments added')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('rejected: the "Request declined" chip', () => {
    renderIt({ state: 'rejected' })
    expect(screen.getByText('Request declined')).toBeInTheDocument()
  })

  it('without a server it writes to the resources repository', async () => {
    vi.mocked(api.requestBookComments).mockResolvedValue({ saved: true, where: 'resources', status: 'pending' })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /request adding the comments/i }))
    expect(await screen.findByText(/Requested/)).toBeInTheDocument()
  })

  it('without a server nor a token it offers the JSON to download', async () => {
    vi.mocked(api.requestBookComments).mockResolvedValue({ saved: false, path: 'suggestions/book-comments/b/x.json', json: '{"a":1}' })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /request adding the comments/i }))
    const link = await screen.findByRole('link', { name: /download/i })
    expect(link).toHaveAttribute('download', 'x.json')
    expect(link.getAttribute('href')).toMatch(/^data:application\/json|^blob:/)
  })

  it('shows an error when the request fails', async () => {
    vi.mocked(api.requestBookComments).mockRejectedValue(new Error('boom'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /request adding the comments/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('shows the reason when stored nowhere after a failure', async () => {
    vi.mocked(api.requestBookComments).mockResolvedValue({ saved: false, path: 'suggestions/book-comments/b/x.json', json: '{}', reason: '403' })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /request adding the comments/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('403')
  })
})
