import { describe, it, expect } from 'vitest'
import { VERSION } from '../index'

describe('chess-shared', () => {
  it('exports VERSION 0.1.0', () => {
    expect(VERSION).toBe('0.1.0')
  })
})
