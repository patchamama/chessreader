import { describe, it, expect } from 'vitest'
import { parseVisionBoard, cleanAiHtml, aiTextToHtml, describePrompt, redrawPrompt, fenPrompt } from './prompts'

const FILES = 'abcdefgh'
function allSquares(piece: (sq: string) => string | null = () => null, confidence = 0.9) {
  const out = []
  for (let r = 8; r >= 1; r--) for (const f of FILES) out.push({ square: `${f}${r}`, piece: piece(`${f}${r}`), confidence })
  return out
}

describe('parseVisionBoard', () => {
  it('accepts 64 squares with piece letters and confidences, and the side to move', () => {
    const json = JSON.stringify({ sideToMove: 'b', squares: allSquares((s) => (s === 'e1' ? 'K' : s === 'e8' ? 'k' : null)) })
    const out = parseVisionBoard(json)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.sideToMove).toBe('b')
    expect(out.readings).toHaveLength(64)
    expect(out.readings.find((r) => r.square === 'e1')).toEqual({ square: 'e1', piece: 'K', confidence: 0.9 })
  })

  it('reads the JSON out of a code fence', () => {
    const json = '```json\n' + JSON.stringify({ squares: allSquares() }) + '\n```'
    expect(parseVisionBoard(json).ok).toBe(true)
  })

  it('rejects fewer than 64 squares, a repeated square, a wrong letter or a confidence out of 0..1', () => {
    const squares = allSquares()
    expect(parseVisionBoard(JSON.stringify({ squares: squares.slice(1) }))).toMatchObject({ ok: false, error: expect.stringMatching(/64/) })
    const repeated = [...squares.slice(1), { ...squares[2] }]
    expect(parseVisionBoard(JSON.stringify({ squares: repeated }))).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) })
    const letter = squares.map((s, i) => (i === 3 ? { ...s, piece: 'X' } : s))
    expect(parseVisionBoard(JSON.stringify({ squares: letter }))).toMatchObject({ ok: false, error: expect.stringMatching(/piece/) })
    const conf = squares.map((s, i) => (i === 3 ? { ...s, confidence: 1.5 } : s))
    expect(parseVisionBoard(JSON.stringify({ squares: conf }))).toMatchObject({ ok: false, error: expect.stringMatching(/confidence/) })
    expect(parseVisionBoard('not json')).toMatchObject({ ok: false })
    expect(parseVisionBoard(JSON.stringify({ sideToMove: 'x', squares }))).toMatchObject({ ok: false, error: expect.stringMatching(/side/) })
  })
})

describe('AI HTML', () => {
  it('keeps tables and lists but drops scripts, handlers, SVG, images and attributes', () => {
    const html = cleanAiHtml('<table onclick="x()"><tr><td colspan="2" style="color:red">a</td></tr></table><script>alert(1)</script><svg><circle/></svg><img src="https://e.x/i.png"><ul><li>b</li></ul>')
    expect(html).toBe('<table><tbody><tr><td colspan="2">a</td></tr></tbody></table><ul><li>b</li></ul>')
  })

  it('turns a Markdown answer (table, list, paragraphs) into HTML', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\nSome **text**.'
    expect(aiTextToHtml(md)).toBe('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><ul><li>one</li><li>two</li></ul><p>Some <strong>text</strong>.</p>')
  })

  it('takes an HTML answer out of a code fence', () => {
    expect(aiTextToHtml('```html\n<p>x</p>\n```')).toBe('<p>x</p>')
  })
})

describe('prompts', () => {
  it('each prompt carries the image and asks for its own output', () => {
    const img = 'data:image/png;base64,AAAA'
    expect(describePrompt(img).messages[0].images).toEqual([img])
    expect(redrawPrompt(img).system).toMatch(/no SVG/i)
    const fen = fenPrompt(img)
    expect(fen.json).toBeTruthy()
    expect(fen.system).toMatch(/64/)
  })
})
