import { describe, expect, it } from 'vitest'
import { crc32, zipStored } from './zip'

describe('zipStored', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes every file with its name, size, CRC and bytes, and a central directory', () => {
    const zip = zipStored([{ name: '01-a.pgn', text: '1. e4 *' }, { name: '02-b.pgn', text: 'é' }])
    const v = new DataView(zip.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    // end of central directory: 2 entries
    const end = zip.length - 22
    expect(v.getUint32(end, true)).toBe(0x06054b50)
    expect(v.getUint16(end + 10, true)).toBe(2)
    // walk the central directory
    let at = v.getUint32(end + 16, true)
    const seen: { name: string; size: number; crc: number }[] = []
    for (let i = 0; i < 2; i++) {
      expect(v.getUint32(at, true)).toBe(0x02014b50)
      const nameLen = v.getUint16(at + 28, true)
      const localAt = v.getUint32(at + 42, true)
      const size = v.getUint32(at + 24, true)
      const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLen))
      const data = zip.slice(localAt + 30 + nameLen, localAt + 30 + nameLen + size)
      expect(v.getUint32(at + 16, true)).toBe(crc32(data))
      seen.push({ name, size, crc: crc32(data) })
      at += 46 + nameLen
    }
    expect(seen.map((s) => s.name)).toEqual(['01-a.pgn', '02-b.pgn'])
    expect(seen[0].size).toBe(7)
    expect(seen[1].size).toBe(2)
  })
})
