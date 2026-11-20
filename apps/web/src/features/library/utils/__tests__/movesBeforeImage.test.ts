import { describe, it, expect } from 'vitest'
import { movesBeforeImage } from '../inferDiagramFen'

// llm-assistant-round S14: a diagram shows the position after the last move of
// the main line written before it, or after the last move of a variation written
// just before it — read from the move spans of the page, in reading order.

const span = (key: string, san: string, fen: string, n: number, color: string) =>
  `<span data-node-id="${key}" data-san="${san}" data-fen="${fen}" data-move-number="${n}" data-color="${color}">${san}</span>`

function page(html: string) {
  const div = document.createElement('div')
  div.innerHTML = html
  return { container: div, img: div.querySelector('img') as HTMLImageElement }
}

const MAIN = new Set(['0:node-1', '0:node-2', '0:node-3'])
const isMain = (gameIndex: number, nodeId: string) => MAIN.has(`${gameIndex}:${nodeId}`)

describe('movesBeforeImage', () => {
  it('takes the last main-line move before the image, not later moves of the chapter', () => {
    const { container, img } = page(
      `<p>1. ${span('0:node-1', 'e4', 'F1', 1, 'white')} ${span('0:node-2', 'e5', 'F2', 1, 'black')}</p>` +
      '<p><img src="d.png"></p>' +
      `<p>2. ${span('0:node-3', 'Nf3', 'F3', 2, 'white')}</p>`,
    )
    const r = movesBeforeImage(img, container, isMain)
    expect(r.main).toEqual({ fen: 'F2', san: 'e5', moveNumber: 1, color: 'black' })
    expect(r.variation).toBeNull()
  })

  it('also offers a variation written after the last main-line move, just before the image', () => {
    const { container, img } = page(
      `<p>1. ${span('0:node-1', 'e4', 'F1', 1, 'white')} ${span('0:node-2', 'e5', 'F2', 1, 'black')}</p>` +
      `<p>(2. ${span('0:node-9', 'd4', 'V1', 2, 'white')} ${span('0:node-10', 'exd4', 'V2', 2, 'black')})</p>` +
      '<p><img src="d.png"></p>',
    )
    const r = movesBeforeImage(img, container, isMain)
    expect(r.main?.san).toBe('e5')
    expect(r.variation).toEqual({ fen: 'V2', san: 'exd4', moveNumber: 2, color: 'black' })
  })

  it('ignores marks without a game and finds nothing before the first move', () => {
    const { container, img } = page(
      `<p>${span('-1:iso-1', 'Rxe3', 'X', 21, 'black')}</p><p><img src="d.png"></p>`,
    )
    expect(movesBeforeImage(img, container, isMain)).toEqual({ main: null, variation: null })
  })
})
