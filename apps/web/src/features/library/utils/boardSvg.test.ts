import { beforeEach, describe, expect, it } from 'vitest'
import { BOOK_STYLE_LABEL, boardSvg, boardSvgDataUrl, generatedDiagramSvg, useDiagramStyleStore } from './boardSvg'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement

beforeEach(() => {
  useSettingsStore.getState().reset()
  useDiagramStyleStore.setState({ style: 'book' })
})

describe('Book diagram style (S1)', () => {
  it('is the default style of generated diagrams', () => {
    useDiagramStyleStore.persist?.clearStorage?.()
    expect(useDiagramStyleStore.getInitialState().style).toBe('book')
    expect(BOOK_STYLE_LABEL).toBe('Book (black & white, hatched dark squares)')
  })

  it('draws white light squares, diagonally hatched dark squares and a thin frame', () => {
    const root = parse(boardSvg(FEN, 320, { style: 'book' }))
    const squares = [...root.querySelectorAll('rect[data-square]')]
    expect(squares).toHaveLength(64)
    const light = squares.filter((r) => r.getAttribute('data-square') === 'light')
    const dark = squares.filter((r) => r.getAttribute('data-square') === 'dark')
    expect(light).toHaveLength(32)
    expect(dark).toHaveLength(32)
    expect(light.every((r) => r.getAttribute('fill') === '#ffffff')).toBe(true)

    const pattern = root.querySelector('pattern')!
    expect(pattern).toBeTruthy()
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(45)')
    expect(pattern.querySelector('line')!.getAttribute('stroke')).toBe('#000000')
    expect(dark.every((r) => r.getAttribute('fill') === `url(#${pattern.id})`)).toBe(true)

    const frame = root.querySelector('rect[data-frame]')!
    expect(frame.getAttribute('fill')).toBe('none')
    expect(frame.getAttribute('stroke')).toBe('#000000')
    expect(root.querySelectorAll('[data-piece]')).toHaveLength(32)
  })

  it('gives each drawing its own hatch id so two inline boards never share a pattern', () => {
    const a = parse(boardSvg(FEN, 320, { style: 'book' })).querySelector('pattern')!.id
    const b = parse(boardSvg(FEN, 320, { style: 'book' })).querySelector('pattern')!.id
    expect(a).not.toBe(b)
  })

  it('generated diagrams use the book style by default, and the diagram theme when another style is chosen', () => {
    expect(generatedDiagramSvg(FEN)).toContain('<pattern')
    expect(decodeURIComponent(boardSvgDataUrl(FEN))).toContain('<pattern')

    useDiagramStyleStore.setState({ style: 'theme' })
    useSettingsStore.setState({ diagramBoardTheme: 'blue' })
    const svg = generatedDiagramSvg(FEN)
    expect(svg).not.toContain('<pattern')
    expect(svg).toContain('#5a80a7')
  })

  it('without a style keeps the board theme of Settings, as the thumbnails do', () => {
    useSettingsStore.setState({ boardTheme: 'green' })
    const svg = boardSvg(FEN)
    expect(svg).toContain('#86a666')
    expect(svg).not.toContain('<pattern')
  })
})
