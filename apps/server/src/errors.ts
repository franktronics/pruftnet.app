import { Data } from 'effect'

/** Process exit codes. Documented in `.agents/doc/server-cli.md` and the README. */
export const ExitCode = {
    success: 0,
    failure: 1,
    usage: 2,
    portUnavailable: 3,
} as const
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

/** Expected failure reported to the user as a message, without a stack trace. */
export class CliError extends Data.TaggedError('CliError')<{
    readonly message: string
    readonly exitCode: ExitCode
    readonly hint?: string
}> {}
