import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LinkedText from './LinkedText'
import { splitUrls } from './splitUrls'

describe('splitUrls', () => {
  it('keeps trailing punctuation out of the url', () => {
    expect(splitUrls('See https://example.org/a?b=1, and (http://x.io/y).')).toEqual([
      { text: 'See ' }, { url: 'https://example.org/a?b=1' }, { text: ', and (' }, { url: 'http://x.io/y' }, { text: ').' },
    ])
  })
  it('returns plain text untouched and ignores other schemes', () => {
    expect(splitUrls('no links, javascript:alert(1)')).toEqual([{ text: 'no links, javascript:alert(1)' }])
  })
})

describe('LinkedText', () => {
  it('renders a url as a link opening in another window', () => {
    render(<LinkedText text="Read https://example.org/x now" />)
    const a = screen.getByRole('link', { name: 'https://example.org/x' })
    expect(a).toHaveAttribute('href', 'https://example.org/x')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
  })
})
