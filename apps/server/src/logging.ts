import { Layer, LogLevel, Logger } from 'effect'

import type { LogFormat, LogLevelName } from '#server/settings/settings'

const loggers: Record<LogFormat, Layer.Layer<never>> = {
    pretty: Logger.pretty,
    logfmt: Logger.logFmt,
    json: Logger.json,
}

const levels: Record<LogLevelName, LogLevel.LogLevel> = {
    all: LogLevel.All,
    trace: LogLevel.Trace,
    debug: LogLevel.Debug,
    info: LogLevel.Info,
    warning: LogLevel.Warning,
    error: LogLevel.Error,
    fatal: LogLevel.Fatal,
    none: LogLevel.None,
}

export function loggingLayer(format: LogFormat, level: LogLevelName) {
    return Layer.merge(loggers[format], Logger.minimumLogLevel(levels[level]))
}
