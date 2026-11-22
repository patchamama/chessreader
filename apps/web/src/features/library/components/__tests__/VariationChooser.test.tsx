import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { VariationChooser } from '../VariationChooser'

// 1. e4 e5 2. Nf3 (2. Nc3 Nf6) Nc6: the chooser offers the main line (Nf3) and the variation (Nc3).
const [game] = recognizeGames('1. e4 e5 2. Nf3 (2. Nc3 Nf6) Nc6 3. Bb5', { algorithm: 2 })
const tree = game.tree
const nodeBySan = (san: string) => [...tree.nodes.values()].find((n) => n.san === san)!
const props = () => ({
  tree, mainlineId: nodeBySan('Nf3').id, siblingLines: [[nodeBySan('Nc3').id, nodeBySan('Nf6').id]],
  onPickMainline: vi.fn(), onPickLine: vi.fn(), onClose: vi.fn(),
})

describe('VariationChooser notation', () => {
  it('shows the moves as the book wrote them when no notation is asked for', () => {
    render(<VariationChooser {...props()} />)
    expect(screen.getByText('2.Nf3')).toBeInTheDocument()
    expect(screen.getByText('2.Nc3')).toBeInTheDocument()
  })

  it('shows them in the letters of the language of the viewer (Spanish: C = knight)', () => {
    render(<VariationChooser {...props()} lang="es" style="letters" />)
    expect(screen.getByText('2.Cf3')).toBeInTheDocument()
    expect(screen.getByText('2.Cc3')).toBeInTheDocument()
  })

  it('or as figurines', () => {
    render(<VariationChooser {...props()} lang="en" style="figurine" />)
    expect(screen.getByText('2.♞f3')).toBeInTheDocument()
    expect(screen.getByText('2.♞c3')).toBeInTheDocument()
  })

  it('also converts a move the book wrote in another language (Spanish source read in English)', () => {
    const [g] = recognizeGames('1. e4 e5 2. Cf3 (2. Cc3 Cf6) Cc6', { algorithm: 2 })
    const t = g.tree
    const by = (san: string) => [...t.nodes.values()].find((n) => n.san === san)!
    render(<VariationChooser tree={t} mainlineId={by('Nf3').id} siblingLines={[[by('Nc3').id]]} onPickMainline={vi.fn()} onPickLine={vi.fn()} onClose={vi.fn()} lang="en" style="letters" />)
    expect(screen.getByText('2.Nf3')).toBeInTheDocument()
  })
})
