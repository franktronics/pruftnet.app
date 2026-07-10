import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { once } from 'node:events'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'

const CODECS = process.env.PRUFTNET_CODEC_ORDER === 'flatbuffers-first' ? ['flatbuffers', 'custom'] : ['custom', 'flatbuffers']

function requireRange(bytes, offset, length, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
        throw new Error(`${label} has an invalid range`)
    }
    if (offset > bytes.byteLength || length > bytes.byteLength - offset) {
        throw new Error(`${label} exceeds the buffer`)
    }
}

class FlatByteBuffer {
    constructor(bytes) {
        this.bytes = bytes
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }

    readInt32(offset) {
        return this.view.getInt32(offset, true)
    }

    readUint8(offset) {
        return this.view.getUint8(offset)
    }

    readUint16(offset) {
        return this.view.getUint16(offset, true)
    }

    readUint32(offset) {
        return this.view.getUint32(offset, true)
    }

    readUint64(offset) {
        return this.view.getBigUint64(offset, true)
    }

    __offset(table, field) {
        requireRange(this.bytes, table, 4, 'FlatBuffers table')
        const vtable = table - this.readInt32(table)
        requireRange(this.bytes, vtable, 4, 'FlatBuffers vtable')
        const vtableLength = this.readUint16(vtable)
        if (field >= vtableLength) {
            return 0
        }
        const offset = this.readUint16(vtable + field)
        if (offset !== 0) {
            requireRange(this.bytes, table + offset, 1, 'FlatBuffers field')
        }
        return offset
    }

    __indirect(offset) {
        requireRange(this.bytes, offset, 4, 'FlatBuffers indirect offset')
        return offset + this.readUint32(offset)
    }

    __vector(offset) {
        requireRange(this.bytes, offset, 4, 'FlatBuffers vector offset')
        const vector = offset + this.readUint32(offset)
        requireRange(this.bytes, vector, 4, 'FlatBuffers vector')
        return vector + 4
    }

    __vector_len(offset) {
        requireRange(this.bytes, offset, 4, 'FlatBuffers vector offset')
        const vector = offset + this.readUint32(offset)
        requireRange(this.bytes, vector, 4, 'FlatBuffers vector length')
        return this.readUint32(vector)
    }
}

function customKind(bytes) {
    requireRange(bytes, 0, 12, 'custom header')
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
    if (magic !== 'PSUM' && magic !== 'PDET') {
        throw new Error('invalid custom magic')
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint16(4, true) !== 1 || view.getUint32(8, true) !== bytes.byteLength) {
        throw new Error('invalid custom header')
    }
    return magic === 'PSUM' ? 'summary' : 'detail'
}

function customSection(bytes, view, offsetField, countField, stride, label) {
    const offset = view.getUint32(offsetField, true)
    const count = view.getUint32(countField, true)
    requireRange(bytes, offset, count * stride, label)
    return { offset, count }
}

function decodeCustom(bytes) {
    const kind = customKind(bytes)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let checksum = 0n

    if (kind === 'summary') {
        requireRange(bytes, 0, 64, 'custom summary header')
        if (view.getUint16(6, true) !== 1 || view.getUint32(56, true) !== 48 || view.getUint32(60, true) !== 24) {
            throw new Error('invalid custom summary layout')
        }
        const packets = customSection(bytes, view, 44, 32, 48, 'custom summary records')
        const protocols = customSection(bytes, view, 48, 36, 4, 'custom protocol IDs')
        const columns = customSection(bytes, view, 52, 40, 24, 'custom columns')
        checksum = view.getBigUint64(16, true) ^ view.getBigUint64(24, true)

        for (let index = 0; index < packets.count; index += 1) {
            const offset = packets.offset + index * 48
            checksum += view.getBigUint64(offset, true)
            checksum += view.getBigUint64(offset + 8, true)
            checksum += BigInt(view.getUint32(offset + 16, true))
            checksum += BigInt(view.getUint32(offset + 20, true))
            checksum += BigInt(view.getUint32(offset + 24, true))
            checksum += BigInt(view.getUint32(offset + 32, true))
            checksum += BigInt(view.getUint32(offset + 36, true))
        }
        for (let index = 0; index < protocols.count; index += 1) {
            checksum += BigInt(view.getUint32(protocols.offset + index * 4, true))
        }
        for (let index = 0; index < columns.count; index += 1) {
            const offset = columns.offset + index * 24
            checksum += BigInt(view.getUint32(offset, true))
            checksum += view.getBigUint64(offset + 8, true)
            checksum += view.getBigUint64(offset + 16, true)
        }
        return BigInt.asUintN(64, checksum)
    }

    requireRange(bytes, 0, 120, 'custom detail header')
    if (
        view.getUint16(6, true) !== 2 ||
        view.getUint32(104, true) !== 48 ||
        view.getUint32(108, true) !== 32 ||
        view.getUint32(112, true) !== 24
    ) {
        throw new Error('invalid custom detail layout')
    }
    const nodes = customSection(bytes, view, 84, 64, 48, 'custom field nodes')
    const sources = customSection(bytes, view, 88, 68, 32, 'custom data sources')
    const contributors = customSection(bytes, view, 92, 72, 24, 'custom contributors')
    const names = customSection(bytes, view, 96, 76, 1, 'custom source names')
    const data = customSection(bytes, view, 100, 80, 1, 'custom source bytes')
    checksum = view.getBigUint64(32, true) + view.getBigUint64(40, true)

    for (let index = 0; index < nodes.count; index += 1) {
        const offset = nodes.offset + index * 48
        checksum += view.getBigUint64(offset, true)
        checksum += view.getBigUint64(offset + 8, true)
        checksum += BigInt(view.getUint32(offset + 16, true))
        checksum += BigInt(view.getUint32(offset + 24, true))
        checksum += BigInt(view.getUint32(offset + 28, true))
    }
    for (let index = 0; index < sources.count; index += 1) {
        const offset = sources.offset + index * 32
        checksum += BigInt(view.getUint32(offset, true))
        checksum += BigInt(view.getUint32(offset + 4, true))
        checksum += BigInt(view.getUint32(offset + 12, true))
        checksum += BigInt(view.getUint32(offset + 16, true))
    }
    for (let index = 0; index < contributors.count; index += 1) {
        const offset = contributors.offset + index * 24
        checksum += view.getBigUint64(offset, true)
        checksum += BigInt(view.getUint32(offset + 8, true))
        checksum += BigInt(view.getUint32(offset + 16, true))
    }
    for (let index = 0; index < names.count; index += 1) {
        checksum += BigInt(bytes[names.offset + index])
    }
    for (let index = 0; index < data.count; index += 1) {
        checksum += BigInt(bytes[data.offset + index])
    }
    return BigInt.asUintN(64, checksum)
}

function flatTable(bb, bytes, table, field, label) {
    const offset = bb.__offset(table, field)
    if (offset === 0) {
        throw new Error(`${label} is missing`)
    }
    const position = bb.__indirect(table + offset)
    requireRange(bytes, position, 4, label)
    return position
}

function flatScalar(bb, table, field, reader, fallback = 0) {
    const offset = bb.__offset(table, field)
    if (offset === 0) {
        return fallback
    }
    const sizes = { readUint8: 1, readUint16: 2, readUint32: 4, readUint64: 8 }
    requireRange(bb.bytes, table + offset, sizes[reader], 'FlatBuffers scalar')
    return bb[reader](table + offset)
}

function flatVector(bb, bytes, table, field, stride, label) {
    const offset = bb.__offset(table, field)
    if (offset === 0) {
        throw new Error(`${label} is missing`)
    }
    const fieldPosition = table + offset
    const count = bb.__vector_len(fieldPosition)
    const start = bb.__vector(fieldPosition)
    requireRange(bytes, start, count * stride, label)
    return { start, count }
}

function decodeFlatbuffers(bytes) {
    requireRange(bytes, 0, 8, 'FlatBuffers envelope')
    if (String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== 'PCBM') {
        throw new Error('invalid FlatBuffers identifier')
    }
    const bb = new FlatByteBuffer(bytes)
    const envelope = bb.readInt32(0)
    requireRange(bytes, envelope, 4, 'FlatBuffers root table')
    const kind = flatScalar(bb, envelope, 6, 'readUint8')
    let checksum = 0n

    if (kind === 1) {
        const summary = flatTable(bb, bytes, envelope, 8, 'FlatBuffers summary')
        checksum = flatScalar(bb, summary, 4, 'readUint64', 0n) ^ flatScalar(bb, summary, 6, 'readUint64', 0n)
        const packets = flatVector(bb, bytes, summary, 10, 48, 'FlatBuffers summary records')
        const protocols = flatVector(bb, bytes, summary, 12, 4, 'FlatBuffers protocol IDs')
        const columns = flatVector(bb, bytes, summary, 14, 24, 'FlatBuffers columns')

        for (let index = 0; index < packets.count; index += 1) {
            const offset = packets.start + index * 48
            checksum += bb.readUint64(offset)
            checksum += bb.readUint64(offset + 8)
            checksum += BigInt(bb.readUint32(offset + 16))
            checksum += BigInt(bb.readUint32(offset + 20))
            checksum += BigInt(bb.readUint32(offset + 24))
            checksum += BigInt(bb.readUint32(offset + 32))
            checksum += BigInt(bb.readUint32(offset + 36))
        }
        for (let index = 0; index < protocols.count; index += 1) {
            checksum += BigInt(bb.readUint32(protocols.start + index * 4))
        }
        for (let index = 0; index < columns.count; index += 1) {
            const offset = columns.start + index * 24
            checksum += BigInt(bb.readUint32(offset))
            checksum += bb.readUint64(offset + 8)
            checksum += bb.readUint64(offset + 16)
        }
        return BigInt.asUintN(64, checksum)
    }

    if (kind !== 2) {
        throw new Error('invalid FlatBuffers message kind')
    }
    const detail = flatTable(bb, bytes, envelope, 10, 'FlatBuffers detail')
    checksum = flatScalar(bb, detail, 8, 'readUint64', 0n) + flatScalar(bb, detail, 10, 'readUint64', 0n)
    const nodes = flatVector(bb, bytes, detail, 22, 48, 'FlatBuffers field nodes')
    const sources = flatVector(bb, bytes, detail, 24, 32, 'FlatBuffers data sources')
    const contributors = flatVector(bb, bytes, detail, 26, 24, 'FlatBuffers contributors')
    const names = flatVector(bb, bytes, detail, 28, 1, 'FlatBuffers source names')
    const data = flatVector(bb, bytes, detail, 30, 1, 'FlatBuffers source bytes')

    for (let index = 0; index < nodes.count; index += 1) {
        const offset = nodes.start + index * 48
        checksum += bb.readUint64(offset)
        checksum += bb.readUint64(offset + 8)
        checksum += BigInt(bb.readUint32(offset + 16))
        checksum += BigInt(bb.readUint32(offset + 24))
        checksum += BigInt(bb.readUint32(offset + 28))
    }
    for (let index = 0; index < sources.count; index += 1) {
        const offset = sources.start + index * 32
        checksum += BigInt(bb.readUint32(offset))
        checksum += BigInt(bb.readUint32(offset + 4))
        checksum += BigInt(bb.readUint32(offset + 12))
        checksum += BigInt(bb.readUint32(offset + 16))
    }
    for (let index = 0; index < contributors.count; index += 1) {
        const offset = contributors.start + index * 24
        checksum += bb.readUint64(offset)
        checksum += BigInt(bb.readUint32(offset + 8))
        checksum += BigInt(bb.readUint32(offset + 16))
    }
    for (let index = 0; index < names.count; index += 1) {
        checksum += BigInt(bb.readUint8(names.start + index))
    }
    for (let index = 0; index < data.count; index += 1) {
        checksum += BigInt(bb.readUint8(data.start + index))
    }
    return BigInt.asUintN(64, checksum)
}

function decoder(codec) {
    if (codec === 'custom') {
        return decodeCustom
    }
    if (codec === 'flatbuffers') {
        return decodeFlatbuffers
    }
    throw new Error(`unknown codec ${codec}`)
}

function measure(iterations, operation) {
    let checksum = 0n
    const start = performance.now()
    for (let index = 0; index < iterations; index += 1) {
        checksum = BigInt.asUintN(64, checksum + BigInt(operation()))
    }
    const seconds = (performance.now() - start) / 1_000
    return { seconds, checksum }
}

function warm(operation, iterations = 20) {
    for (let index = 0; index < iterations; index += 1) {
        operation()
    }
}

function printMetric({ codec, operation, workload, bytes, iterations, seconds, checksum }) {
    console.log(
        `metric stage=node codec=${codec} operation=${operation} workload=${workload}` +
            ` bytes=${bytes} iterations=${iterations} seconds=${seconds}` +
            ` ops_per_second=${iterations / seconds} checksum=${checksum}`,
    )
}

async function runDecodeWorker(codec, workload, source, iterations) {
    return await new Promise((resolve, reject) => {
        const copy = source.slice().buffer
        const worker = new Worker(new URL(import.meta.url), {
            workerData: { mode: 'decode', codec, workload, iterations, buffer: copy },
            transferList: [copy],
        })
        worker.once('message', resolve)
        worker.once('error', reject)
    })
}

async function measureTransfer(codec, workload, source, iterations) {
    const worker = new Worker(new URL(import.meta.url), { workerData: { mode: 'echo' } })
    await once(worker, 'online')
    const start = performance.now()
    let checksum = 0
    for (let index = 0; index < iterations; index += 1) {
        const copy = source.slice().buffer
        const response = once(worker, 'message')
        worker.postMessage(copy, [copy])
        const [value] = await response
        checksum += value
    }
    const seconds = (performance.now() - start) / 1_000
    await worker.terminate()
    return { seconds, checksum: BigInt(checksum) }
}

async function main() {
    const artifactDirectory = process.argv[2]
    if (!artifactDirectory) {
        throw new Error('usage: node packet_codec_node_benchmark.mjs <artifact-directory>')
    }

    for (const workload of ['summary', 'detail']) {
        const artifacts = {}
        for (const codec of CODECS) {
            const source = new Uint8Array(await readFile(join(artifactDirectory, `${workload}-${codec}.bin`)))
            const decode = decoder(codec)
            const checksum = decode(source)
            try {
                decode(source.subarray(0, source.byteLength - 1))
                throw new Error(`${codec} accepted a truncated ${workload} buffer`)
            } catch (error) {
                if (error.message.includes('accepted a truncated')) {
                    throw error
                }
            }
            artifacts[codec] = { source, checksum }
        }
        if (artifacts.custom.checksum !== artifacts.flatbuffers.checksum) {
            throw new Error(`${workload} checksum mismatch between codecs`)
        }

        const decodeIterations = workload === 'summary' ? 200 : 1_000
        const passThroughIterations = 1_000_000
        const transferIterations = 100
        for (const codec of CODECS) {
            const { source } = artifacts[codec]
            const decode = decoder(codec)
            warm(() => decode(source))
            const passThrough = measure(passThroughIterations, () => {
                const buffer = Buffer.from(source.buffer, source.byteOffset, source.byteLength)
                return buffer.byteLength
            })
            printMetric({
                codec,
                operation: 'buffer_pass_through',
                workload,
                bytes: source.byteLength,
                iterations: passThroughIterations,
                ...passThrough,
            })

            const mainDecode = measure(decodeIterations, () => decode(source))
            printMetric({
                codec,
                operation: 'decode_main',
                workload,
                bytes: source.byteLength,
                iterations: decodeIterations,
                ...mainDecode,
            })

            const workerDecode = await runDecodeWorker(codec, workload, source, decodeIterations)
            printMetric({ codec, operation: 'decode_worker', ...workerDecode })

            const transfer = await measureTransfer(codec, workload, source, transferIterations)
            printMetric({
                codec,
                operation: 'copy_transfer_roundtrip',
                workload,
                bytes: source.byteLength,
                iterations: transferIterations,
                ...transfer,
            })
        }
    }
}

if (isMainThread) {
    await main()
} else if (workerData.mode === 'decode') {
    const source = new Uint8Array(workerData.buffer)
    const decode = decoder(workerData.codec)
    warm(() => decode(source))
    const result = measure(workerData.iterations, () => decode(source))
    parentPort.postMessage({
        codec: workerData.codec,
        operation: 'decode_worker',
        workload: workerData.workload,
        bytes: source.byteLength,
        iterations: workerData.iterations,
        seconds: result.seconds,
        checksum: result.checksum,
    })
} else {
    parentPort.on('message', (buffer) => {
        const bytes = new Uint8Array(buffer)
        parentPort.postMessage(bytes[0])
    })
}
