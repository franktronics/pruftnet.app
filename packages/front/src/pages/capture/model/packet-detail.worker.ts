import { decodePacketDetail, PacketDetailDecodedKeyError } from './packet-detail-decoder'
import type { PacketDetailDecodeRequest, PacketDetailWorkerResponse } from './packet-detail'

const worker = globalThis as unknown as {
    onmessage: ((event: MessageEvent<PacketDetailDecodeRequest>) => void) | null
    postMessage(message: PacketDetailWorkerResponse, transfer: Transferable[]): void
}

worker.onmessage = ({ data }) => {
    try {
        const model = decodePacketDetail(data)
        worker.postMessage(
            { kind: 'success', model },
            model.sources.map((source) => source.bytes.buffer),
        )
    } catch (cause) {
        const keyError = cause instanceof PacketDetailDecodedKeyError
        worker.postMessage(
            {
                kind: 'error',
                error: {
                    kind: keyError ? 'key' : 'invalid',
                    message: cause instanceof Error ? cause.message : String(cause),
                },
            },
            [],
        )
    }
}
