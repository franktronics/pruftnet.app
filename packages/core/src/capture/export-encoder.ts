import { createHash } from 'node:crypto'
import { open, type FileHandle } from 'node:fs/promises'

import { Context, Data, Effect, Layer } from 'effect'

import type { ExportSourceSegment } from './export-repository'

const SECTION_HEADER_BLOCK = 0x0a0d0d0a
const INTERFACE_DESCRIPTION_BLOCK = 0x00000001
const ENHANCED_PACKET_BLOCK = 0x00000006
const BYTE_ORDER_MAGIC = 0x1a2b3c4d
const MAXIMUM_BLOCK_BYTES = 64 * 1024 * 1024

export class ExportEncodingError extends Data.TaggedError('ExportEncodingError')<{
    readonly code:
        | 'Cancelled'
        | 'DestinationOpenFailed'
        | 'DestinationWriteFailed'
        | 'SourceMissing'
        | 'SourceCorrupt'
        | 'FormatUnsupported'
    readonly message: string
    readonly cause?: unknown
}> {}

export interface ExportProgress {
    readonly packetsWritten: string
    readonly bytesWritten: string
}

export interface EncodeExportInput {
    readonly format: 'pcapng' | 'pcap'
    readonly segments: ReadonlyArray<ExportSourceSegment>
    readonly partialPath: string
    readonly onProgress: (progress: ExportProgress) => void
}

export interface EncodedExport {
    readonly packetsWritten: string
    readonly bytesWritten: string
    readonly checksumSha256: string
    readonly finalSize: string
}

interface ParsedBlock {
    readonly type: number
    readonly bytes: Buffer
}

interface PcapngHeader {
    readonly blocks: ReadonlyArray<Buffer>
    readonly interfaceCount: number
    readonly linkType: number
    readonly snaplen: number
    readonly timestampResolution: number
}

function encodingError(code: ExportEncodingError['code'], message: string, cause?: unknown) {
    return new ExportEncodingError({ code, message, cause })
}

async function readExact(handle: FileHandle, buffer: Buffer, position: number) {
    let offset = 0
    while (offset < buffer.length) {
        const result = await handle.read(buffer, offset, buffer.length - offset, position + offset)
        if (result.bytesRead === 0) return false
        offset += result.bytesRead
    }
    return true
}

async function writeExact(handle: FileHandle, buffer: Buffer) {
    let offset = 0
    while (offset < buffer.length) {
        const result = await handle.write(buffer, offset, buffer.length - offset)
        if (result.bytesWritten === 0) {
            throw encodingError(
                'DestinationWriteFailed',
                'The export destination made no progress.',
            )
        }
        offset += result.bytesWritten
    }
}

function readUInt16LE(buffer: Buffer, offset: number) {
    return buffer.readUInt16LE(offset)
}

function readTimestampResolution(block: Buffer) {
    let offset = 16
    while (offset + 4 <= block.length - 4) {
        const code = readUInt16LE(block, offset)
        const length = readUInt16LE(block, offset + 2)
        offset += 4
        if (code === 0) break
        const paddedLength = (length + 3) & ~3
        if (offset + paddedLength > block.length - 4) {
            throw encodingError('SourceCorrupt', 'An interface option exceeds its pcapng block.')
        }
        if (code === 9 && length === 1) return block[offset]!
        offset += paddedLength
    }
    return 6
}

async function* readBlocks(
    segment: ExportSourceSegment,
    signal: AbortSignal,
): AsyncGenerator<ParsedBlock> {
    const committedBytes = BigInt(segment.committedBytes)
    if (committedBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw encodingError('SourceCorrupt', 'A segment committed offset is too large to address.')
    }
    let handle: FileHandle
    try {
        handle = await open(segment.path, 'r')
    } catch (cause) {
        throw encodingError(
            'SourceMissing',
            `Unable to open source segment ${segment.generation}.`,
            cause,
        )
    }
    try {
        let position = 0
        const boundary = Number(committedBytes)
        while (position < boundary) {
            if (signal.aborted) throw encodingError('Cancelled', 'The export was cancelled.')
            if (boundary - position < 12) {
                throw encodingError('SourceCorrupt', 'A committed pcapng tail is incomplete.')
            }
            const prefix = Buffer.allocUnsafe(8)
            if (!(await readExact(handle, prefix, position))) {
                throw encodingError(
                    'SourceCorrupt',
                    'A source segment ended before its committed offset.',
                )
            }
            const length = prefix.readUInt32LE(4)
            if (
                length < 12 ||
                length % 4 !== 0 ||
                length > MAXIMUM_BLOCK_BYTES ||
                position + length > boundary
            ) {
                throw encodingError(
                    'SourceCorrupt',
                    'A committed pcapng block has an invalid length.',
                )
            }
            const block = Buffer.allocUnsafe(length)
            prefix.copy(block)
            if (!(await readExact(handle, block.subarray(8), position + 8))) {
                throw encodingError('SourceCorrupt', 'A committed pcapng block is truncated.')
            }
            if (block.readUInt32LE(length - 4) !== length) {
                throw encodingError(
                    'SourceCorrupt',
                    'A pcapng block length trailer does not match.',
                )
            }
            yield { type: block.readUInt32LE(0), bytes: block }
            position += length
        }
        if (position !== boundary) {
            throw encodingError(
                'SourceCorrupt',
                'The committed segment boundary is not block-aligned.',
            )
        }
    } finally {
        await handle.close().catch(() => undefined)
    }
}

function validateSection(block: Buffer) {
    if (block.length < 28 || block.readUInt32LE(8) !== BYTE_ORDER_MAGIC) {
        throw encodingError('SourceCorrupt', 'The pcapng section header is invalid or unsupported.')
    }
}

function parseHeaderBlock(block: Buffer, current: PcapngHeader | undefined): PcapngHeader {
    if (current) {
        return {
            ...current,
            blocks: [...current.blocks, block],
            interfaceCount: current.interfaceCount + 1,
        }
    }
    return {
        blocks: [block],
        interfaceCount: 1,
        linkType: block.readUInt16LE(8),
        snaplen: block.readUInt32LE(12),
        timestampResolution: readTimestampResolution(block),
    }
}

function headersEqual(left: ReadonlyArray<Buffer>, right: ReadonlyArray<Buffer>) {
    return left.length === right.length && left.every((block, index) => block.equals(right[index]!))
}

async function inspectSegmentHeader(
    segment: ExportSourceSegment,
    signal: AbortSignal,
): Promise<{ header: PcapngHeader; packets: AsyncGenerator<ParsedBlock> }> {
    const blocks = readBlocks(segment, signal)
    const first = await blocks.next()
    if (first.done || first.value.type !== SECTION_HEADER_BLOCK) {
        throw encodingError(
            'SourceCorrupt',
            'A source segment does not begin with a pcapng section.',
        )
    }
    validateSection(first.value.bytes)
    let header: PcapngHeader | undefined
    let firstPacket: ParsedBlock | undefined
    while (true) {
        const next = await blocks.next()
        if (next.done) break
        if (next.value.type === INTERFACE_DESCRIPTION_BLOCK && !firstPacket) {
            header = parseHeaderBlock(next.value.bytes, header)
            continue
        }
        firstPacket = next.value
        break
    }
    if (!header) throw encodingError('SourceCorrupt', 'A pcapng section has no interfaces.')
    const packets = (async function* () {
        if (firstPacket) yield firstPacket
        for await (const block of blocks) yield block
    })()
    return {
        header: { ...header, blocks: [first.value.bytes, ...header.blocks] },
        packets,
    }
}

function parseEnhancedPacket(block: Buffer, interfaceCount: number) {
    if (block.length < 36 || block.readUInt32LE(0) !== ENHANCED_PACKET_BLOCK) {
        throw encodingError('SourceCorrupt', 'The spool contains an unsupported pcapng block.')
    }
    const interfaceIndex = block.readUInt32LE(8)
    const capturedLength = block.readUInt32LE(20)
    const wireLength = block.readUInt32LE(24)
    const paddedLength = (capturedLength + 3) & ~3
    if (interfaceIndex >= interfaceCount || 28 + paddedLength + 4 > block.length - 4) {
        throw encodingError('SourceCorrupt', 'An enhanced packet block is invalid.')
    }
    return {
        interfaceIndex,
        timestamp: (BigInt(block.readUInt32LE(12)) << 32n) | BigInt(block.readUInt32LE(16)),
        capturedLength,
        wireLength,
        packet: block.subarray(28, 28 + capturedLength),
    }
}

function pcapGlobalHeader(header: PcapngHeader) {
    const output = Buffer.alloc(24)
    output.writeUInt32LE(header.timestampResolution === 9 ? 0xa1b23c4d : 0xa1b2c3d4, 0)
    output.writeUInt16LE(2, 4)
    output.writeUInt16LE(4, 6)
    output.writeInt32LE(0, 8)
    output.writeUInt32LE(0, 12)
    output.writeUInt32LE(header.snaplen, 16)
    output.writeUInt32LE(header.linkType, 20)
    return output
}

function pcapPacket(packet: ReturnType<typeof parseEnhancedPacket>, resolution: number) {
    const divisor = resolution === 9 ? 1_000_000_000n : 1_000_000n
    const seconds = packet.timestamp / divisor
    const fraction = packet.timestamp % divisor
    if (seconds > 0xffff_ffffn) {
        throw encodingError('FormatUnsupported', 'A packet timestamp exceeds the pcap range.')
    }
    const header = Buffer.alloc(16)
    header.writeUInt32LE(Number(seconds), 0)
    header.writeUInt32LE(Number(fraction), 4)
    header.writeUInt32LE(packet.capturedLength, 8)
    header.writeUInt32LE(packet.wireLength, 12)
    return [header, packet.packet] as const
}

async function encode(input: EncodeExportInput, signal: AbortSignal): Promise<EncodedExport> {
    if (input.segments.length === 0) {
        throw encodingError('SourceMissing', 'The export snapshot has no source segments.')
    }
    let output: FileHandle
    try {
        output = await open(input.partialPath, 'wx', 0o600)
    } catch (cause) {
        throw encodingError(
            'DestinationOpenFailed',
            'Unable to create the partial export file.',
            cause,
        )
    }
    const digest = createHash('sha256')
    let packetsWritten = 0n
    let bytesWritten = 0n
    let lastReportedPackets = 0n
    const write = async (buffer: Buffer) => {
        try {
            await writeExact(output, buffer)
        } catch (cause) {
            if (cause instanceof ExportEncodingError) throw cause
            throw encodingError(
                'DestinationWriteFailed',
                'Unable to write the export destination.',
                cause,
            )
        }
        digest.update(buffer)
        bytesWritten += BigInt(buffer.length)
    }
    const report = async (force = false) => {
        if (!force && packetsWritten - lastReportedPackets < 1_024n) return
        input.onProgress({
            packetsWritten: packetsWritten.toString(),
            bytesWritten: bytesWritten.toString(),
        })
        lastReportedPackets = packetsWritten
    }
    try {
        let canonicalHeader: PcapngHeader | undefined
        for (const [index, segment] of input.segments.entries()) {
            const inspected = await inspectSegmentHeader(segment, signal)
            if (!canonicalHeader) {
                canonicalHeader = inspected.header
                if (input.format === 'pcapng') {
                    for (const block of canonicalHeader.blocks) await write(block)
                } else {
                    if (canonicalHeader.interfaceCount !== 1) {
                        throw encodingError(
                            'FormatUnsupported',
                            'Classic pcap export requires exactly one capture interface.',
                        )
                    }
                    if (![6, 9].includes(canonicalHeader.timestampResolution)) {
                        throw encodingError(
                            'FormatUnsupported',
                            'Classic pcap export requires microsecond or nanosecond timestamps.',
                        )
                    }
                    await write(pcapGlobalHeader(canonicalHeader))
                }
            } else if (!headersEqual(canonicalHeader.blocks, inspected.header.blocks)) {
                throw encodingError(
                    'SourceCorrupt',
                    `Source segment ${index} has incompatible pcapng headers.`,
                )
            }
            for await (const block of inspected.packets) {
                if (signal.aborted) throw encodingError('Cancelled', 'The export was cancelled.')
                const packet = parseEnhancedPacket(block.bytes, canonicalHeader.interfaceCount)
                if (input.format === 'pcapng') {
                    await write(block.bytes)
                } else {
                    if (packet.interfaceIndex !== 0) {
                        throw encodingError(
                            'FormatUnsupported',
                            'Classic pcap cannot preserve multiple interfaces.',
                        )
                    }
                    for (const part of pcapPacket(packet, canonicalHeader.timestampResolution)) {
                        await write(part)
                    }
                }
                packetsWritten += 1n
                await report()
            }
        }
        await report(true)
        await output.sync()
        return {
            packetsWritten: packetsWritten.toString(),
            bytesWritten: bytesWritten.toString(),
            checksumSha256: digest.digest('hex'),
            finalSize: bytesWritten.toString(),
        }
    } finally {
        await output.close().catch(() => undefined)
    }
}

export interface ExportEncoderService {
    readonly encode: (input: EncodeExportInput) => Effect.Effect<EncodedExport, ExportEncodingError>
}

export class ExportEncoder extends Context.Tag('@repo/core/capture/ExportEncoder')<
    ExportEncoder,
    ExportEncoderService
>() {
    static readonly layer = Layer.succeed(
        ExportEncoder,
        ExportEncoder.of({
            encode: (input) =>
                Effect.tryPromise({
                    try: (signal) => encode(input, signal),
                    catch: (cause) =>
                        cause instanceof ExportEncodingError
                            ? cause
                            : encodingError(
                                  'DestinationWriteFailed',
                                  'Export encoding failed.',
                                  cause,
                              ),
                }),
        }),
    )
}
