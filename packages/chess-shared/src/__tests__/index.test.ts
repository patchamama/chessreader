import { describe, it, expect } from 'vitest'
import { VERSION } from '../index'

describe('chess-shared', () => {
  it('exports VERSION 0.5.0', () => {
    expect(VERSION).toBe('0.5.0')
  })
})
