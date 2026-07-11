import { ByteBuffer } from 'flatbuffers'
import { ContributorRecord } from './generated/pruftnet/wire/contributor-record.js'
import { DataSourceKind } from './generated/pruftnet/wire/data-source-kind.js'
import { DataSourceRecord } from './generated/pruftnet/wire/data-source-record.js'
import { FieldNode } from './generated/pruftnet/wire/field-node.js'
import { MessageKind } from './generated/pruftnet/wire/message-kind.js'
import { PacketKey } from './generated/pruftnet/wire/packet-key.js'
import { PacketTreeEnvelope } from './generated/pruftnet/wire/packet-tree-envelope.js'
import { PacketTreePayload } from './generated/pruftnet/wire/packet-tree-payload.js'
import { ParseCondition } from './generated/pruftnet/wire/parse-condition.js'
import { ValueTag } from './generated/pruftnet/wire/value-tag.js'

const FILE_IDENTIFIER = [0x50, 0x52, 0x54, 0x32] as const
const FORMAT_VERSION = 1
const NO_PARENT = 0xffff_ffff
const GENERATED_NODE_FLAG = 1
const EMPTY_BYTES = new Uint8Array()
const utf8 = new TextDecoder('utf-8', { fatal: true })

export const PacketTreeValueTag = {
    none: ValueTag.None,
    unsigned: ValueTag.Unsigned,
    signed: ValueTag.Signed,
    boolean: ValueTag.Boolean,
    bytes: ValueTag.Bytes,
    string: ValueTag.String,
    generatedText: ValueTag.GeneratedText,
} as const

export type PacketTreeReadErrorCode =
    | 'message-too-large'
    | 'shared-buffer'
    | 'truncated'
    | 'wrong-identifier'
    | 'malformed-flatbuffer'
    | 'unsupported-version'
    | 'wrong-message-kind'
    | 'missing-payload'
    | 'registry-revision-mismatch'
    | 'invalid-packet-key'
    | 'invalid-condition'
    | 'resource-limit'
    | 'unknown-field'
    | 'invalid-field-value'
    | 'invalid-parent'
    | 'invalid-data-source'
    | 'invalid-range'
    | 'invalid-utf8'

export class PacketTreeReadError extends Error {
    code: PacketTreeReadErrorCode
    offset: number
    index: number

    constructor(code: PacketTreeReadErrorCode, message: string, offset = 0, index = 0) {
        super(message)
        this.name = 'PacketTreeReadError'
        this.code = code
        this.offset = offset
        this.index = index
    }
}

export interface PacketTreeReadLimits {
    expectedRegistryRevision: bigint
    fieldValueTags: ReadonlyMap<number, number>
    maxMessageBytes?: number
    maxNodes?: number
    maxDepth?: number
    maxDataSources?: number
    maxContributors?: number
    maxStringBytes?: number
    maxValueBytes?: number
    maxSourceBytes?: number
}

export interface PacketTreeNode {
    fieldId: number
    parentIndex: number
    dataSourceId: number
    offset: number
    length: number
    flags: number
    valueTag: number
    valueLow: bigint
    valueHigh: bigint
    valueOffset: number
    valueLength: number
}

export interface PacketTreeDataSource {
    id: number
    kind: number
    nameOffset: number
    nameLength: number
    sourceOffset: number
    sourceLength: number
    contributorOffset: number
    contributorCount: number
}

export interface PacketTreeContributor {
    captureIdHigh: bigint
    captureIdLow: bigint
    packetId: bigint
    sourceOffset: number
    sourceLength: number
    destinationOffset: number
    destinationLength: number
}

interface ResolvedLimits {
    expectedRegistryRevision: bigint
    fieldValueTags: ReadonlyMap<number, number>
    maxMessageBytes: number
    maxNodes: number
    maxDepth: number
    maxDataSources: number
    maxContributors: number
    maxStringBytes: number
    maxValueBytes: number
    maxSourceBytes: number
}

interface TableMetadata {
    position: number
    vtable: number
    vtableLength: number
    objectLength: number
}

interface VectorMetadata {
    data: number
    count: number
}

class BoundedFlatBuffer {
    private view: DataView

    constructor(private bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }

    rootTable(): TableMetadata {
        this.require(0, 8)
        const root = this.u32(0)
        if (root < 8) {
            this.fail(
                'malformed-flatbuffer',
                'Root table offset points into the FlatBuffers header',
                root,
            )
        }
        return this.table(root)
    }

    identifierMatches(): boolean {
        this.require(4, FILE_IDENTIFIER.length)
        return FILE_IDENTIFIER.every((value, index) => this.bytes[4 + index] === value)
    }

    field(table: TableMetadata, index: number, width: number): number | undefined {
        const slot = safeAdd(table.vtable, 4 + index * 2)
        if (slot + 2 > table.vtable + table.vtableLength) {
            return undefined
        }
        const relative = this.u16(slot)
        if (relative === 0) {
            return undefined
        }
        if (relative + width > table.objectLength) {
            this.fail(
                'malformed-flatbuffer',
                'Table field exceeds its object boundary',
                table.position + relative,
            )
        }
        const position = safeAdd(table.position, relative)
        this.require(position, width)
        const alignment = Math.min(width, 8)
        if (position % alignment !== 0) {
            this.fail('malformed-flatbuffer', 'Table field is misaligned', position)
        }
        return position
    }

    indirectField(table: TableMetadata, index: number): TableMetadata | undefined {
        const position = this.field(table, index, 4)
        if (position === undefined) {
            return undefined
        }
        const relative = this.u32(position)
        if (relative === 0) {
            this.fail('malformed-flatbuffer', 'Indirect table offset is zero', position)
        }
        return this.table(safeAdd(position, relative))
    }

    vector(table: TableMetadata, index: number, stride: number, alignment: number): VectorMetadata {
        const field = this.field(table, index, 4)
        if (field === undefined) {
            return { data: 0, count: 0 }
        }
        const relative = this.u32(field)
        if (relative === 0) {
            this.fail('malformed-flatbuffer', 'Vector offset is zero', field)
        }
        const vector = safeAdd(field, relative)
        this.require(vector, 4)
        if (vector % 4 !== 0) {
            this.fail('malformed-flatbuffer', 'Vector length is misaligned', vector)
        }
        const count = this.u32(vector)
        const data = safeAdd(vector, 4)
        this.require(data, safeMultiply(count, stride))
        if (data % alignment !== 0) {
            this.fail('malformed-flatbuffer', 'Vector data is misaligned', data)
        }
        return { data, count }
    }

    u8(offset: number): number {
        this.require(offset, 1)
        return this.view.getUint8(offset)
    }

    u16(offset: number): number {
        this.require(offset, 2)
        return this.view.getUint16(offset, true)
    }

    u32(offset: number): number {
        this.require(offset, 4)
        return this.view.getUint32(offset, true)
    }

    i32(offset: number): number {
        this.require(offset, 4)
        return this.view.getInt32(offset, true)
    }

    u64(offset: number): bigint {
        this.require(offset, 8)
        return this.view.getBigUint64(offset, true)
    }

    private table(position: number): TableMetadata {
        this.require(position, 4)
        if (position % 4 !== 0) {
            this.fail('malformed-flatbuffer', 'Table is misaligned', position)
        }
        const vtableDistance = this.i32(position)
        if (vtableDistance === 0) {
            this.fail('malformed-flatbuffer', 'Invalid vtable distance', position)
        }
        const vtable = position - vtableDistance
        if (!Number.isSafeInteger(vtable) || vtable < 0 || vtable % 2 !== 0) {
            this.fail('malformed-flatbuffer', 'Invalid or misaligned vtable position', vtable)
        }
        this.require(vtable, 4)
        const vtableLength = this.u16(vtable)
        const objectLength = this.u16(vtable + 2)
        if (vtableLength < 4 || vtableLength % 2 !== 0 || objectLength < 4) {
            this.fail('malformed-flatbuffer', 'Invalid table or vtable length', vtable)
        }
        this.require(vtable, vtableLength)
        this.require(position, objectLength)
        return { position, vtable, vtableLength, objectLength }
    }

    private require(offset: number, length: number): void {
        if (
            !Number.isSafeInteger(offset) ||
            !Number.isSafeInteger(length) ||
            offset < 0 ||
            length < 0
        ) {
            this.fail('malformed-flatbuffer', 'Unsafe FlatBuffers range', offset)
        }
        if (offset > this.bytes.byteLength || length > this.bytes.byteLength - offset) {
            this.fail('truncated', 'FlatBuffers range exceeds the input', offset)
        }
    }

    private fail(code: PacketTreeReadErrorCode, message: string, offset: number): never {
        throw new PacketTreeReadError(code, message, offset)
    }
}

function safeAdd(left: number, right: number): number {
    const result = left + right
    if (!Number.isSafeInteger(result) || result < 0) {
        throw new PacketTreeReadError(
            'malformed-flatbuffer',
            'FlatBuffers offset addition overflowed',
            left,
        )
    }
    return result
}

function safeMultiply(left: number, right: number): number {
    const result = left * right
    if (!Number.isSafeInteger(result) || result < 0) {
        throw new PacketTreeReadError('malformed-flatbuffer', 'FlatBuffers vector size overflowed')
    }
    return result
}

function validRange(offset: number, length: number, size: number): boolean {
    return (
        Number.isSafeInteger(offset) &&
        Number.isSafeInteger(length) &&
        offset >= 0 &&
        length >= 0 &&
        offset <= size &&
        length <= size - offset
    )
}

function resolveLimits(limits: PacketTreeReadLimits): ResolvedLimits {
    if (
        limits.expectedRegistryRevision <= 0n ||
        limits.expectedRegistryRevision > 0xffff_ffff_ffff_ffffn
    ) {
        throw new PacketTreeReadError(
            'resource-limit',
            'Expected registry revision must be a nonzero uint64',
        )
    }
    const resolved = {
        expectedRegistryRevision: limits.expectedRegistryRevision,
        fieldValueTags: limits.fieldValueTags,
        maxMessageBytes: limits.maxMessageBytes ?? 128 * 1024 * 1024,
        maxNodes: limits.maxNodes ?? 65_536,
        maxDepth: limits.maxDepth ?? 256,
        maxDataSources: limits.maxDataSources ?? 64,
        maxContributors: limits.maxContributors ?? 4_096,
        maxStringBytes: limits.maxStringBytes ?? 1024 * 1024,
        maxValueBytes: limits.maxValueBytes ?? 16 * 1024 * 1024,
        maxSourceBytes: limits.maxSourceBytes ?? 64 * 1024 * 1024,
    }
    for (const [name, value] of Object.entries(resolved)) {
        if (
            typeof value === 'number' &&
            (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff)
        ) {
            throw new PacketTreeReadError('resource-limit', `${name} must be a nonnegative uint32`)
        }
    }
    return resolved
}

export class PacketTreeReader {
    private nodeRecord = new FieldNode()
    private sourceRecord = new DataSourceRecord()
    private contributorRecord = new ContributorRecord()
    private packetKeyRecord = new PacketKey()
    private stringBytes: Uint8Array
    private valueBytes: Uint8Array
    private sourceData: Uint8Array

    private constructor(
        private tree: PacketTreePayload,
        private limits: ResolvedLimits,
    ) {
        this.stringBytes = tree.stringArenaArray() ?? EMPTY_BYTES
        this.valueBytes = tree.valueArenaArray() ?? EMPTY_BYTES
        this.sourceData = tree.sourceArenaArray() ?? EMPTY_BYTES
    }

    static open(
        input: ArrayBuffer | Uint8Array,
        requestedLimits: PacketTreeReadLimits,
    ): PacketTreeReader {
        // The caller transfers mutation rights for this view's lifetime. This keeps
        // worker-transferred ArrayBuffers zero-copy after validation.
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
        if (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer) {
            throw new PacketTreeReadError(
                'shared-buffer',
                'SharedArrayBuffer input cannot provide exclusive immutable ownership',
            )
        }
        const limits = resolveLimits(requestedLimits)
        if (bytes.byteLength > limits.maxMessageBytes) {
            throw new PacketTreeReadError(
                'message-too-large',
                'Packet tree exceeds the configured message limit',
            )
        }

        const bounded = new BoundedFlatBuffer(bytes)
        if (!bounded.identifierMatches()) {
            throw new PacketTreeReadError(
                'wrong-identifier',
                'Packet tree file identifier is not PRT2',
                4,
            )
        }
        const envelopeTable = bounded.rootTable()
        const versionField = bounded.field(envelopeTable, 0, 2)
        const version = versionField === undefined ? FORMAT_VERSION : bounded.u16(versionField)
        if (version !== FORMAT_VERSION) {
            throw new PacketTreeReadError(
                'unsupported-version',
                `Unsupported packet tree version ${version}`,
            )
        }
        const kindField = bounded.field(envelopeTable, 1, 1)
        const kind = kindField === undefined ? MessageKind.None : bounded.u8(kindField)
        if (kind !== MessageKind.PacketTree) {
            throw new PacketTreeReadError(
                'wrong-message-kind',
                `Unexpected packet tree message kind ${kind}`,
            )
        }
        const treeTable = bounded.indirectField(envelopeTable, 2)
        if (treeTable === undefined) {
            throw new PacketTreeReadError('missing-payload', 'Packet tree payload is missing')
        }

        const revisionField = bounded.field(treeTable, 0, 8)
        const revision = revisionField === undefined ? 0n : bounded.u64(revisionField)
        if (revision !== limits.expectedRegistryRevision) {
            throw new PacketTreeReadError(
                'registry-revision-mismatch',
                `Expected registry ${limits.expectedRegistryRevision}, received ${revision}`,
            )
        }
        const packetKeyField = bounded.field(treeTable, 1, 24)
        if (packetKeyField === undefined) {
            throw new PacketTreeReadError('invalid-packet-key', 'Packet key is missing')
        }
        if (bounded.u64(packetKeyField) === 0n && bounded.u64(packetKeyField + 8) === 0n) {
            throw new PacketTreeReadError('invalid-packet-key', 'Capture ID is nil', packetKeyField)
        }
        if (bounded.u64(packetKeyField + 16) === 0n) {
            throw new PacketTreeReadError(
                'invalid-packet-key',
                'Packet ID is zero',
                packetKeyField + 16,
            )
        }
        const conditionField = bounded.field(treeTable, 2, 1)
        const condition =
            conditionField === undefined ? ParseCondition.Complete : bounded.u8(conditionField)
        if (condition < ParseCondition.Complete || condition > ParseCondition.ResourceLimit) {
            throw new PacketTreeReadError(
                'invalid-condition',
                `Invalid parse condition ${condition}`,
            )
        }

        const nodes = bounded.vector(treeTable, 3, FieldNode.sizeOf(), 8)
        const sources = bounded.vector(treeTable, 4, DataSourceRecord.sizeOf(), 4)
        const contributors = bounded.vector(treeTable, 5, ContributorRecord.sizeOf(), 8)
        const strings = bounded.vector(treeTable, 6, 1, 1)
        const values = bounded.vector(treeTable, 7, 1, 1)
        const sourceData = bounded.vector(treeTable, 8, 1, 1)
        if (
            nodes.count === 0 ||
            nodes.count > limits.maxNodes ||
            sources.count === 0 ||
            sources.count > limits.maxDataSources ||
            contributors.count > limits.maxContributors ||
            strings.count > limits.maxStringBytes ||
            values.count > limits.maxValueBytes ||
            sourceData.count > limits.maxSourceBytes
        ) {
            throw new PacketTreeReadError(
                'resource-limit',
                'Packet tree exceeds configured vector limits',
            )
        }

        const byteBuffer = new ByteBuffer(bytes)
        const envelope = PacketTreeEnvelope.getRootAsPacketTreeEnvelope(byteBuffer)
        const tree = envelope.packetTree()
        if (tree === null) {
            throw new PacketTreeReadError('missing-payload', 'Packet tree payload is missing')
        }
        const reader = new PacketTreeReader(tree, limits)
        reader.validateSemantics()
        return reader
    }

    registryRevision(): bigint {
        return this.tree.registryRevision()
    }

    condition(): number {
        return this.tree.condition()
    }

    packetKey(): { captureIdHigh: bigint; captureIdLow: bigint; packetId: bigint } {
        const key = this.tree.packetKey(this.packetKeyRecord)
        if (key === null) {
            throw new PacketTreeReadError('invalid-packet-key', 'Packet key is missing')
        }
        return {
            captureIdHigh: key.captureIdHigh(),
            captureIdLow: key.captureIdLow(),
            packetId: key.packetId(),
        }
    }

    nodeCount(): number {
        return this.tree.nodesLength()
    }

    dataSourceCount(): number {
        return this.tree.dataSourcesLength()
    }

    contributorCount(): number {
        return this.tree.contributorsLength()
    }

    node(index: number): PacketTreeNode {
        const node = this.nodeAt(index)
        return {
            fieldId: node.fieldId(),
            parentIndex: node.parentIndex(),
            dataSourceId: node.dataSourceId(),
            offset: node.offset(),
            length: node.length(),
            flags: node.flags(),
            valueTag: node.valueTag(),
            valueLow: node.valueLow(),
            valueHigh: node.valueHigh(),
            valueOffset: node.valueOffset(),
            valueLength: node.valueLength(),
        }
    }

    dataSource(index: number): PacketTreeDataSource {
        const source = this.sourceAt(index)
        return {
            id: source.id(),
            kind: source.kind(),
            nameOffset: source.nameOffset(),
            nameLength: source.nameLength(),
            sourceOffset: source.sourceOffset(),
            sourceLength: source.sourceLength(),
            contributorOffset: source.contributorOffset(),
            contributorCount: source.contributorCount(),
        }
    }

    contributor(index: number): PacketTreeContributor {
        const contributor = this.contributorAt(index)
        return {
            captureIdHigh: contributor.captureIdHigh(),
            captureIdLow: contributor.captureIdLow(),
            packetId: contributor.packetId(),
            sourceOffset: contributor.sourceOffset(),
            sourceLength: contributor.sourceLength(),
            destinationOffset: contributor.destinationOffset(),
            destinationLength: contributor.destinationLength(),
        }
    }

    sourceName(index: number): string {
        const source = this.sourceAt(index)
        return this.decodeText(
            this.stringBytes.subarray(
                source.nameOffset(),
                source.nameOffset() + source.nameLength(),
            ),
        )
    }

    sourceBytes(index: number): Uint8Array {
        const source = this.sourceAt(index)
        return this.sourceData.subarray(
            source.sourceOffset(),
            source.sourceOffset() + source.sourceLength(),
        )
    }

    nodeBytes(index: number): Uint8Array {
        const node = this.nodeAt(index)
        if (node.valueTag() !== ValueTag.Bytes) {
            return EMPTY_BYTES
        }
        return this.valueBytes.subarray(node.valueOffset(), node.valueOffset() + node.valueLength())
    }

    nodeText(index: number): string {
        const node = this.nodeAt(index)
        if (node.valueTag() !== ValueTag.String && node.valueTag() !== ValueTag.GeneratedText) {
            return ''
        }
        return this.decodeText(
            this.stringBytes.subarray(node.valueOffset(), node.valueOffset() + node.valueLength()),
        )
    }

    checksum(): bigint {
        const key = this.packetKey()
        let checksum = key.captureIdHigh ^ key.captureIdLow ^ key.packetId ^ this.registryRevision()
        for (let index = 0; index < this.nodeCount(); index += 1) {
            const node = this.nodeAt(index)
            checksum += BigInt(
                node.fieldId() +
                    node.parentIndex() +
                    node.dataSourceId() +
                    node.offset() +
                    node.length(),
            )
            checksum += node.valueLow() + node.valueHigh()
            checksum += BigInt(node.valueOffset() + node.valueLength() + node.flags())
        }
        for (let index = 0; index < this.dataSourceCount(); index += 1) {
            const source = this.sourceAt(index)
            checksum += BigInt(
                source.id() +
                    source.nameOffset() +
                    source.nameLength() +
                    source.sourceOffset() +
                    source.sourceLength() +
                    source.contributorOffset() +
                    source.contributorCount(),
            )
        }
        for (let index = 0; index < this.contributorCount(); index += 1) {
            const contributor = this.contributorAt(index)
            checksum ^=
                contributor.captureIdHigh() ^ contributor.captureIdLow() ^ contributor.packetId()
            checksum += BigInt(
                contributor.sourceOffset() +
                    contributor.sourceLength() +
                    contributor.destinationOffset() +
                    contributor.destinationLength(),
            )
        }
        for (const arena of [this.stringBytes, this.valueBytes, this.sourceData]) {
            for (const byte of arena) {
                checksum += BigInt(byte)
            }
        }
        return BigInt.asUintN(64, checksum)
    }

    private validateSemantics(): void {
        let expectedContributorOffset = 0
        for (let index = 0; index < this.dataSourceCount(); index += 1) {
            const source = this.sourceAt(index)
            if (
                source.id() !== index ||
                source.kind() < DataSourceKind.Captured ||
                source.kind() > DataSourceKind.Derived ||
                (index === 0) !== (source.kind() === DataSourceKind.Captured) ||
                source.reservedByte() !== 0 ||
                source.reservedShort() !== 0
            ) {
                throw new PacketTreeReadError(
                    'invalid-data-source',
                    'Invalid data source identity or kind',
                    0,
                    index,
                )
            }
            if (
                !validRange(
                    source.nameOffset(),
                    source.nameLength(),
                    this.stringBytes.byteLength,
                ) ||
                !validRange(
                    source.sourceOffset(),
                    source.sourceLength(),
                    this.sourceData.byteLength,
                ) ||
                !validRange(
                    source.contributorOffset(),
                    source.contributorCount(),
                    this.contributorCount(),
                ) ||
                source.contributorOffset() !== expectedContributorOffset
            ) {
                throw new PacketTreeReadError(
                    'invalid-range',
                    'Data source arena range is invalid',
                    0,
                    index,
                )
            }
            this.decodeText(
                this.stringBytes.subarray(
                    source.nameOffset(),
                    source.nameOffset() + source.nameLength(),
                ),
            )
            for (let offset = 0; offset < source.contributorCount(); offset += 1) {
                const contributorIndex = source.contributorOffset() + offset
                const contributor = this.contributorAt(contributorIndex)
                if (
                    (contributor.captureIdHigh() === 0n && contributor.captureIdLow() === 0n) ||
                    contributor.packetId() === 0n ||
                    !validRange(
                        contributor.destinationOffset(),
                        contributor.destinationLength(),
                        source.sourceLength(),
                    ) ||
                    contributor.sourceOffset() + contributor.sourceLength() > 0xffff_ffff
                ) {
                    throw new PacketTreeReadError(
                        'invalid-range',
                        'Contributor range or packet key is invalid',
                        0,
                        contributorIndex,
                    )
                }
            }
            expectedContributorOffset += source.contributorCount()
        }
        if (expectedContributorOffset !== this.contributorCount()) {
            throw new PacketTreeReadError(
                'invalid-range',
                'Data source contributor slices do not cover the contributor vector',
            )
        }

        for (let index = 0; index < this.nodeCount(); index += 1) {
            const node = this.node(index)
            const wireNode = this.nodeAt(index)
            const expectedTag = this.limits.fieldValueTags.get(node.fieldId)
            if (expectedTag === undefined) {
                throw new PacketTreeReadError(
                    'unknown-field',
                    `Unknown field ID ${node.fieldId}`,
                    0,
                    index,
                )
            }
            if (
                node.valueTag !== expectedTag ||
                node.valueTag < ValueTag.None ||
                node.valueTag > ValueTag.GeneratedText ||
                wireNode.reservedByte() !== 0 ||
                wireNode.reservedShort() !== 0
            ) {
                throw new PacketTreeReadError(
                    'invalid-field-value',
                    'Field value tag does not match the registry',
                    0,
                    index,
                )
            }
            if (
                (index === 0 && node.parentIndex !== NO_PARENT) ||
                (index !== 0 && (node.parentIndex === NO_PARENT || node.parentIndex >= index))
            ) {
                throw new PacketTreeReadError(
                    'invalid-parent',
                    'Node parent index is invalid',
                    0,
                    index,
                )
            }
            let depth = 1
            for (
                let parent = node.parentIndex;
                parent !== NO_PARENT;
                parent = this.nodeAt(parent).parentIndex()
            ) {
                depth += 1
            }
            if (depth > this.limits.maxDepth) {
                throw new PacketTreeReadError(
                    'resource-limit',
                    'Node depth exceeds the configured limit',
                    0,
                    index,
                )
            }
            if (node.dataSourceId >= this.dataSourceCount()) {
                throw new PacketTreeReadError(
                    'invalid-data-source',
                    'Node data source ID is invalid',
                    0,
                    index,
                )
            }
            const source = this.sourceAt(node.dataSourceId)
            const generatedZeroRange =
                (node.flags & GENERATED_NODE_FLAG) !== 0 && node.offset === 0 && node.length === 0
            if (
                !generatedZeroRange &&
                !validRange(node.offset, node.length, source.sourceLength())
            ) {
                throw new PacketTreeReadError(
                    'invalid-range',
                    'Node source range is invalid',
                    0,
                    index,
                )
            }
            if (node.valueTag === ValueTag.Bytes) {
                if (!validRange(node.valueOffset, node.valueLength, this.valueBytes.byteLength)) {
                    throw new PacketTreeReadError(
                        'invalid-field-value',
                        'Node byte range is invalid',
                        0,
                        index,
                    )
                }
            } else if (
                node.valueTag === ValueTag.String ||
                node.valueTag === ValueTag.GeneratedText
            ) {
                if (!validRange(node.valueOffset, node.valueLength, this.stringBytes.byteLength)) {
                    throw new PacketTreeReadError(
                        'invalid-field-value',
                        'Node string range is invalid',
                        0,
                        index,
                    )
                }
                this.decodeText(
                    this.stringBytes.subarray(
                        node.valueOffset,
                        node.valueOffset + node.valueLength,
                    ),
                )
            } else if (node.valueOffset !== 0 || node.valueLength !== 0) {
                throw new PacketTreeReadError(
                    'invalid-field-value',
                    'Scalar node contains invalid arena data',
                    0,
                    index,
                )
            }
            const signedHigh = (node.valueLow & (1n << 63n)) === 0n ? 0n : 0xffff_ffff_ffff_ffffn
            if (
                ((node.valueTag === ValueTag.None ||
                    node.valueTag === ValueTag.Bytes ||
                    node.valueTag === ValueTag.String ||
                    node.valueTag === ValueTag.GeneratedText) &&
                    (node.valueLow !== 0n || node.valueHigh !== 0n)) ||
                (node.valueTag === ValueTag.Unsigned && node.valueHigh !== 0n) ||
                (node.valueTag === ValueTag.Signed && node.valueHigh !== signedHigh) ||
                (node.valueTag === ValueTag.Boolean &&
                    (node.valueLow > 1n || node.valueHigh !== 0n))
            ) {
                throw new PacketTreeReadError(
                    'invalid-field-value',
                    'Node scalar value is not canonical',
                    0,
                    index,
                )
            }
        }
    }

    private nodeAt(index: number): FieldNode {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.nodeCount()) {
            throw new PacketTreeReadError('invalid-range', 'Node index is out of range', 0, index)
        }
        const node = this.tree.nodes(index, this.nodeRecord)
        if (node === null) {
            throw new PacketTreeReadError('invalid-range', 'Node vector is missing', 0, index)
        }
        return node
    }

    private sourceAt(index: number): DataSourceRecord {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.dataSourceCount()) {
            throw new PacketTreeReadError(
                'invalid-range',
                'Data source index is out of range',
                0,
                index,
            )
        }
        const source = this.tree.dataSources(index, this.sourceRecord)
        if (source === null) {
            throw new PacketTreeReadError(
                'invalid-range',
                'Data source vector is missing',
                0,
                index,
            )
        }
        return source
    }

    private contributorAt(index: number): ContributorRecord {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.contributorCount()) {
            throw new PacketTreeReadError(
                'invalid-range',
                'Contributor index is out of range',
                0,
                index,
            )
        }
        const contributor = this.tree.contributors(index, this.contributorRecord)
        if (contributor === null) {
            throw new PacketTreeReadError(
                'invalid-range',
                'Contributor vector is missing',
                0,
                index,
            )
        }
        return contributor
    }

    private decodeText(bytes: Uint8Array): string {
        try {
            return utf8.decode(bytes)
        } catch {
            throw new PacketTreeReadError('invalid-utf8', 'String arena contains invalid UTF-8')
        }
    }
}
