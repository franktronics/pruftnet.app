export function heartbeatRequiresReconciliation(
    currentInstanceId: string | undefined,
    lastSequence: bigint,
    nextInstanceId: string,
    nextSequence: bigint,
) {
    return currentInstanceId !== nextInstanceId || nextSequence > lastSequence
}

export function hasSequenceGap(lastSequence: bigint, nextSequence: bigint) {
    return nextSequence > lastSequence + 1n
}
