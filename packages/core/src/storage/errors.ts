import { Data } from 'effect'

export class AppDataPathError extends Data.TaggedError('AppDataPathError')<{
    readonly message: string
    readonly cause?: unknown
}> {}

export class InstanceLockError extends Data.TaggedError('InstanceLockError')<{
    readonly message: string
    readonly lockPath: string
    readonly ownerPid?: number
    readonly cause?: unknown
}> {}

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
    readonly operation: string
    readonly message: string
    readonly cause?: unknown
}> {}
