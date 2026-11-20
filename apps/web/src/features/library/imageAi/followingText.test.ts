import { describe, it, expect } from 'vitest'
import { followingTextOf } from './followingText'

function setup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  return { root, mark: root.querySelector('[data-diagram-overlay]')! }
}

describe('followingTextOf', () => {
  it('is the text after the image, one paragraph per line, up to the next image', () => {
    const { root, mark } = setup('<p>before 1.e4</p><p><span data-diagram-overlay="1"><button>x</button></span></p><p>21...Txe3</p><p>22.d4 <b>Ac5</b></p><p><img src="n.png"></p><p>after</p>')
    expect(followingTextOf(mark, root).trim()).toBe('21...Txe3\n22.d4 Ac5')
  })

  it('stops at a heading and skips hidden FEN lines', () => {
    const { root, mark } = setup('<p><span data-diagram-overlay="1"></span></p><p aria-hidden="true">8/8/8/8/8/8/8/8 w - - 0 1</p><p>1.e4</p><h2>Next</h2><p>2.d4</p>')
    expect(followingTextOf(mark, root).trim()).toBe('1.e4')
  })

  it('is at most the given length', () => {
    const { root, mark } = setup(`<p><span data-diagram-overlay="1"></span></p><p>${'a'.repeat(3000)}</p>`)
    expect(followingTextOf(mark, root, 1500).length).toBeLessThanOrEqual(1500)
  })
})
