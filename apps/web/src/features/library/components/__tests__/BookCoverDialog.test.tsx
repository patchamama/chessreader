import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const env = vi.hoisted(() => ({ images: vi.fn(), upload: vi.fn(), save: vi.fn() }))
vi.mock('../../../suggestions/epubApi', () => ({ listBookImages: env.images, uploadSuggestionAsset: env.upload }))
vi.mock('../../../suggestions/suggestionsApi', () => ({ saveSuggestion: env.save }))

import BookCoverDialog from '../BookCoverDialog'

const book = { id: 5, title: 'Placeholder Book' }

describe('BookCoverDialog: a new or missing cover as a suggestion (S6)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    env.images.mockResolvedValue([
      { path: 'OEBPS/Images/d1.png', url: '/api/library/books/5/images/OEBPS/Images/d1.png', cover: false },
    ])
    env.save.mockResolvedValue({ saved: true, where: 'server', path: 'x' })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
  })

  it('picking one of the book images saves a cover suggestion pointing at it', async () => {
    render(<BookCoverDialog book={book} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use OEBPS/Images/d1.png' }))
    expect(screen.getByAltText('New cover')).toHaveAttribute('src', '/api/library/books/5/images/OEBPS/Images/d1.png')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest this cover' }))
    await screen.findByText(/Cover suggestion saved/)
    const s = env.save.mock.calls[0][0]
    expect(s).toMatchObject({ kind: 'cover', target: { book: 'Placeholder Book' }, after: { epubPath: 'OEBPS/Images/d1.png' }, status: 'pending', author: 'user' })
    expect(env.upload).not.toHaveBeenCalled()
  })

  it('an uploaded image is stored first and the suggestion points at its URL', async () => {
    env.upload.mockResolvedValue('/api/suggestions/assets/abc.png')
    render(<BookCoverDialog book={book} onClose={() => {}} />)
    const file = new File(['png'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Upload an image/), { target: { files: [file] } })
    expect(screen.getByAltText('New cover')).toHaveAttribute('src', 'blob:preview')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest this cover' }))
    await waitFor(() => expect(env.save).toHaveBeenCalled())
    expect(env.upload).toHaveBeenCalledWith(file)
    expect(env.save.mock.calls[0][0].after).toEqual({ src: '/api/suggestions/assets/abc.png' })
  })

  it('refuses a file that is not a PNG, JPEG or WebP image', async () => {
    render(<BookCoverDialog book={book} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Upload an image/), { target: { files: [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })] } })
    expect(screen.getByText('Choose a PNG, JPEG or WebP image.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest this cover' })).toBeDisabled()
  })

  it('a missing cover shows "No cover" and the same flow', async () => {
    render(<BookCoverDialog book={book} onClose={() => {}} />)
    fireEvent.error(screen.getByAltText('Current cover'))
    expect(screen.getByText('No cover')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Use OEBPS/Images/d1.png' })).toBeInTheDocument()
  })
})
