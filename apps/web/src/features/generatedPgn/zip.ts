/** A zip of files kept as they are (no compression): enough to hand over one .pgn per game. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStored(files: { name: string; text: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (v: DataView, at: number, n: number) => v.setUint16(at, n, true)
  const u32 = (v: DataView, at: number, n: number) => v.setUint32(at, n, true)
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0x0800); u16(local, 8, 0)
    u16(local, 10, 0); u16(local, 12, 0x21); u32(local, 14, crc); u32(local, 18, data.length); u32(local, 22, data.length); u16(local, 26, name.length); u16(local, 28, 0)
    parts.push(new Uint8Array(local.buffer), name, data)
    const entry = new DataView(new ArrayBuffer(46))
    u32(entry, 0, 0x02014b50); u16(entry, 4, 20); u16(entry, 6, 20); u16(entry, 8, 0x0800); u16(entry, 10, 0)
    u16(entry, 12, 0); u16(entry, 14, 0x21); u32(entry, 16, crc); u32(entry, 20, data.length); u32(entry, 24, data.length); u16(entry, 28, name.length)
    u32(entry, 42, offset)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  u32(end, 0, 0x06054b50); u16(end, 8, files.length); u16(end, 10, files.length); u32(end, 12, size); u32(end, 16, offset)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) { out.set(p, at); at += p.length }
  return out
}
