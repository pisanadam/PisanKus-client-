import zlib from 'node:zlib'

/**
 * Just enough NBT to read and rewrite Minecraft's own data files.
 *
 * The codec is deliberately generic rather than shaped around one file: values
 * it does not understand still survive a read/write round trip. That matters
 * for `servers.dat`, where the launcher only edits the name and address but
 * must not drop the resource-pack flag or the cached server icon sitting beside
 * them.
 */

/**
 * Written as a frozen object rather than an `enum`: enums need a compile step,
 * and this file has to stay readable by plain type-stripping so it can be
 * tested directly.
 */
export const Tag = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12
} as const

export type Tag = (typeof Tag)[keyof typeof Tag]

/**
 * A tagged value, so the type survives even when nothing here inspects it.
 *
 * The tags are referenced through `typeof Tag.X` because `Tag` is a frozen
 * object rather than an enum — that is what keeps the discriminated union
 * narrowing correctly on `entry.type`.
 */
export type NbtValue =
  | {
      type: typeof Tag.Byte | typeof Tag.Short | typeof Tag.Int | typeof Tag.Float | typeof Tag.Double
      value: number
    }
  | { type: typeof Tag.Long; value: bigint }
  | { type: typeof Tag.String; value: string }
  | { type: typeof Tag.ByteArray; value: Buffer }
  | { type: typeof Tag.IntArray; value: number[] }
  | { type: typeof Tag.LongArray; value: bigint[] }
  | { type: typeof Tag.List; itemType: Tag; value: NbtValue[] }
  | { type: typeof Tag.Compound; value: Map<string, NbtValue> }

class Reader {
  private offset = 0
  private readonly buffer: Buffer

  constructor(buffer: Buffer) {
    this.buffer = buffer
  }

  private take(bytes: number): number {
    const at = this.offset
    this.offset += bytes
    if (this.offset > this.buffer.length) throw new Error('NBT verisi beklenenden kısa.')
    return at
  }

  byte(): number {
    return this.buffer.readInt8(this.take(1))
  }
  short(): number {
    return this.buffer.readInt16BE(this.take(2))
  }
  int(): number {
    return this.buffer.readInt32BE(this.take(4))
  }
  long(): bigint {
    return this.buffer.readBigInt64BE(this.take(8))
  }
  float(): number {
    return this.buffer.readFloatBE(this.take(4))
  }
  double(): number {
    return this.buffer.readDoubleBE(this.take(8))
  }

  string(): string {
    const length = this.buffer.readUInt16BE(this.take(2))
    return this.buffer.toString('utf8', this.take(length), this.offset)
  }

  value(type: Tag): NbtValue {
    switch (type) {
      case Tag.Byte:
        return { type, value: this.byte() }
      case Tag.Short:
        return { type, value: this.short() }
      case Tag.Int:
        return { type, value: this.int() }
      case Tag.Float:
        return { type, value: this.float() }
      case Tag.Double:
        return { type, value: this.double() }
      case Tag.Long:
        return { type, value: this.long() }
      case Tag.String:
        return { type, value: this.string() }
      case Tag.ByteArray: {
        const length = this.int()
        return { type, value: Buffer.from(this.buffer.subarray(this.take(length), this.offset)) }
      }
      case Tag.IntArray: {
        const length = this.int()
        return { type, value: Array.from({ length }, () => this.int()) }
      }
      case Tag.LongArray: {
        const length = this.int()
        return { type, value: Array.from({ length }, () => this.long()) }
      }
      case Tag.List: {
        const itemType = this.byte() as Tag
        const length = this.int()
        // A list of TAG_End is how an empty list is written.
        const value = itemType === Tag.End ? [] : Array.from({ length }, () => this.value(itemType))
        return { type, itemType, value }
      }
      case Tag.Compound: {
        const value = new Map<string, NbtValue>()
        for (;;) {
          const entryType = this.byte() as Tag
          if (entryType === Tag.End) break
          value.set(this.string(), this.value(entryType))
        }
        return { type, value }
      }
      default:
        throw new Error(`Bilinmeyen NBT etiketi: ${type}`)
    }
  }
}

class Writer {
  private readonly parts: Buffer[] = []

  private push(size: number, fill: (buffer: Buffer) => void): void {
    const buffer = Buffer.allocUnsafe(size)
    fill(buffer)
    this.parts.push(buffer)
  }

  byte(value: number): void {
    this.push(1, (b) => b.writeInt8(value))
  }
  string(value: string): void {
    const encoded = Buffer.from(value, 'utf8')
    this.push(2, (b) => b.writeUInt16BE(encoded.length))
    this.parts.push(encoded)
  }

  value(entry: NbtValue): void {
    switch (entry.type) {
      case Tag.Byte:
        return this.push(1, (b) => b.writeInt8(entry.value))
      case Tag.Short:
        return this.push(2, (b) => b.writeInt16BE(entry.value))
      case Tag.Int:
        return this.push(4, (b) => b.writeInt32BE(entry.value))
      case Tag.Float:
        return this.push(4, (b) => b.writeFloatBE(entry.value))
      case Tag.Double:
        return this.push(8, (b) => b.writeDoubleBE(entry.value))
      case Tag.Long:
        return this.push(8, (b) => b.writeBigInt64BE(entry.value))
      case Tag.String:
        return this.string(entry.value)
      case Tag.ByteArray:
        this.push(4, (b) => b.writeInt32BE(entry.value.length))
        this.parts.push(entry.value)
        return
      case Tag.IntArray:
        this.push(4, (b) => b.writeInt32BE(entry.value.length))
        for (const item of entry.value) this.push(4, (b) => b.writeInt32BE(item))
        return
      case Tag.LongArray:
        this.push(4, (b) => b.writeInt32BE(entry.value.length))
        for (const item of entry.value) this.push(8, (b) => b.writeBigInt64BE(item))
        return
      case Tag.List:
        this.byte(entry.value.length === 0 ? Tag.End : entry.itemType)
        this.push(4, (b) => b.writeInt32BE(entry.value.length))
        for (const item of entry.value) this.value(item)
        return
      case Tag.Compound:
        for (const [name, item] of entry.value) {
          this.byte(item.type)
          this.string(name)
          this.value(item)
        }
        this.byte(Tag.End)
        return
    }
  }

  finish(): Buffer {
    return Buffer.concat(this.parts)
  }
}

export interface NbtFile {
  /** Root tag name — usually empty, but preserved so a rewrite matches. */
  name: string
  root: NbtValue
  /** Whether the file on disk was gzipped, so it is written back the same way. */
  compressed: boolean
}

/** Reads an NBT file, gzipped or not. */
export function readNbt(raw: Buffer): NbtFile {
  const compressed = raw[0] === 0x1f && raw[1] === 0x8b
  const buffer = compressed ? zlib.gunzipSync(raw) : raw

  const reader = new Reader(buffer)
  const type = reader.byte() as Tag
  if (type !== Tag.Compound) throw new Error('NBT dosyası bir bileşimle başlamıyor.')

  const name = reader.string()
  return { name, root: reader.value(Tag.Compound), compressed }
}

export function writeNbt(file: NbtFile): Buffer {
  const writer = new Writer()
  writer.byte(file.root.type)
  writer.string(file.name)
  writer.value(file.root)

  const plain = writer.finish()
  return file.compressed ? zlib.gzipSync(plain) : plain
}

/** Convenience for the shapes this launcher actually reads. */
export function compound(entry: NbtValue | undefined): Map<string, NbtValue> | undefined {
  return entry?.type === Tag.Compound ? entry.value : undefined
}

export function stringValue(entry: NbtValue | undefined): string | undefined {
  return entry?.type === Tag.String ? entry.value : undefined
}
