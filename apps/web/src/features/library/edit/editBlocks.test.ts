import { describe, it, expect } from 'vitest'
import { editBlocks } from './editBlocks'

const page = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('editBlocks', () => {
  it('matches the shown blocks with the loaded ones, leaving out what the reader added', () => {
    const raw = '<p>One.</p><p>Two.</p><p>Three.</p>'
    const shown = page('<p>One.</p><div class="pending-suggestion" data-pending-suggestion="x"><p>Added.</p></div><p>Two.</p><p class="epub-fen-hidden" data-session-fen="">8/8/8/8/8/8/8/8 w - - 0 1</p><p>Three.</p>')
    expect(editBlocks(shown, raw).map((b) => [b.index, b.text])).toEqual([[0, 'One.'], [1, 'Two.'], [2, 'Three.']])
  })

  it('a paragraph whose moves the reader shows in another notation is still matched', () => {
    const raw = '<p>Intro.</p><p>White plays 1.♗f3 or 1.♖a1 here.</p><p>End.</p>'
    const shown = page('<p>Intro.</p><p>White plays 1.<span data-node-id="0:a">Bf3</span> or 1.Ra1 here.</p><p>End.</p>')
    expect(editBlocks(shown, raw).map((b) => [b.index, b.text])).toEqual([
      [0, 'Intro.'], [1, 'White plays 1.♗f3 or 1.♖a1 here.'], [2, 'End.'],
    ])
  })

  it('a line of moves only is matched in place, never with an empty line', () => {
    const raw = '<p>A.</p><p>1.♘f3 ♘f6</p><p> </p><p>B.</p>'
    expect(editBlocks(page('<p>A.</p><p>1.Nf3 Nf6</p><p> </p><p>B.</p>'), raw).map((b) => b.index)).toEqual([0, 1, 2, 3])
    expect(editBlocks(page('<p>A.</p><p> </p><p>B.</p>'), '<p>A.</p><p>1.♘f3</p><p> </p><p>B.</p>').map((b) => b.index)).toEqual([0, 2, 3])
  })
})
