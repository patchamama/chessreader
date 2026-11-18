import { describe, it, expect } from 'vitest'
import { cssHeadingClasses, detectHeadings, levelFromClassName, levelFromStyle } from './headingDetect'

const root = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('headingDetect', () => {
  it('reads a level from font size, weight and alignment', () => {
    expect(levelFromStyle('font-size: 2em; font-weight: bold')).toBe(1)
    expect(levelFromStyle('font-size: 150%')).toBe(2)
    expect(levelFromStyle('font-size: 20px')).toBe(3)
    expect(levelFromStyle('font-size: 1.1em; text-align: center')).toBe(4)
    expect(levelFromStyle('font-weight: 700; text-align: center')).toBe(5)
    expect(levelFromStyle('font-weight: bold')).toBeNull()
    expect(levelFromStyle('')).toBeNull()
  })

  it('reads a level from class names', () => {
    expect(levelFromClassName('h2')).toBe(2)
    expect(levelFromClassName('titulo')).toBe(1)
    expect(levelFromClassName('subtitulo')).toBe(2)
    expect(levelFromClassName('titulo3')).toBe(3)
    expect(levelFromClassName('texto')).toBeNull()
  })

  it('maps the book stylesheet classes to levels', () => {
    const map = cssHeadingClasses('/* x */ p.cap { font-size: 1.8em } .sub, div .sub2 { font-size: 1.4em; } .body { margin: 0 }')
    expect(map.get('cap')).toBe(1)
    expect(map.get('sub')).toBe(2)
    expect(map.get('sub2')).toBe(2)
    expect(map.has('body')).toBe(false)
  })

  it('marks heading paragraphs and leaves prose, moves and markers alone', () => {
    const el = root(`
      <style>.cap { font-size: 1.8em }</style>
      <p class="cap">Chapter title</p>
      <p class="titulo">Moves 1. e4 e5</p>
      <p class="h4">1. e4 e5 2. Nf3</p>
      <p style="font-size: 2em">This is a very long paragraph written in large type that keeps going on and on and on.</p>
      <p>Plain</p>
      <div data-game-marker="start" class="h2"></div>`)
    expect(detectHeadings(el)).toBe(2)
    const headings = [...el.querySelectorAll('[role="heading"]')]
    expect(headings.map((h) => [h.textContent, h.getAttribute('aria-level')])).toEqual([
      ['Chapter title', '1'],
      ['Moves 1. e4 e5', '1'],
    ])
    expect(headings[0].classList.contains('epub-h1')).toBe(true)
    // Idempotent.
    expect(detectHeadings(el)).toBe(2)
    expect(el.querySelectorAll('[role="heading"]').length).toBe(2)
  })
})
