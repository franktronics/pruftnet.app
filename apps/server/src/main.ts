import { ValidationError } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { Cause, Console, Effect, Exit, Option } from 'effect'

import { runCli } from './cli/app'
import { extractLogLevel, LogLevelFlag } from './cli/options'
import { CliError, ExitCode } from './errors'

function exitCodeOf(exit: Exit.Exit<unknown, unknown>): number {
    if (Exit.isSuccess(exit) || Cause.isInterruptedOnly(exit.cause)) return ExitCode.success
    const failure = Cause.failureOption(exit.cause)
    if (Option.isSome(failure) && failure.value instanceof CliError) return failure.value.exitCode
    if (Option.isSome(failure) && ValidationError.isValidationError(failure.value)) {
        return ExitCode.usage
    }
    return ExitCode.failure
}

function reportFailure(cause: Cause.Cause<unknown>) {
    if (Cause.isInterruptedOnly(cause)) return Effect.void
    const failure = Cause.failureOption(cause)
    // @effect/cli has already printed usage errors with the relevant help.
    if (Option.isSome(failure) && ValidationError.isValidationError(failure.value)) {
        return Effect.void
    }
    if (Option.isSome(failure) && failure.value instanceof CliError) {
        const { message, hint } = failure.value
        return Console.error(hint ? `Error: ${message}\nHint: ${hint}` : `Error: ${message}`)
    }
    return Console.error(Cause.pretty(cause))
}

const { args, logLevel } = extractLogLevel(process.argv)

// Without a command, show help instead of silently exiting.
runCli(args.length > 2 ? args : [...args, '--help']).pipe(
    Effect.provideService(LogLevelFlag, logLevel),
    Effect.tapErrorCause(reportFailure),
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain({
        disableErrorReporting: true,
        disablePrettyLogger: true,
        teardown: (exit, onExit) => onExit(exitCodeOf(exit)),
    }),
)
