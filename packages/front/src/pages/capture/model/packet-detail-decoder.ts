import { PacketTreeReader, packetTreeReadRegistry } from '@repo/packet-codec'

import {
    packetDetailModel,
    type PacketDetailDecodeRequest,
    type PacketDetailModel,
} from './packet-detail'

export function decodePacketDetail(request: PacketDetailDecodeRequest): PacketDetailModel {
    const model = packetDetailModel(
        PacketTreeReader.open(request.bytes, packetTreeReadRegistry(request.registry)),
    )
    if (
        model.packetKey.captureId !== request.expectedCaptureId ||
        model.packetKey.packetId !== request.expectedPacketId
    )
        throw new PacketDetailDecodedKeyError()
    return model
}

export class PacketDetailDecodedKeyError extends Error {
    constructor() {
        super('Packet detail payload key does not match the selected packet')
    }
}
