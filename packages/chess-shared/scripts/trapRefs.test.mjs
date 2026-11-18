// Where each trap of Lococo's book is, by chapter (the reader's numbering: non-empty form-feed parts, from 1).
import { describe, expect, it } from 'vitest'
import { chapterOfTitle } from './trapRefs.mjs'

describe('chapterOfTitle', () => {
  const text = 'Portada\fCapítulo I\nCeladas con cebo\nCelada del pardillo\n1. e4 e5\f\f  \fCapítulo II\nCelada Bon Appetit\n1. d4'
  it('finds the chapter whose text holds the trap title, counting non-empty parts', () => {
    expect(chapterOfTitle(text, 'Celada del pardillo')).toBe(2)
    expect(chapterOfTitle(text, 'Celada Bon Appetit')).toBe(3)
  })
  it('ignores case and spacing, and answers null when the title is not there', () => {
    expect(chapterOfTitle(text, 'celada  BON appetit')).toBe(3)
    expect(chapterOfTitle(text, 'Celada inexistente')).toBeNull()
  })
})
