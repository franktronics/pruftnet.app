import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { extractLogLevel, toSettingFlags } from './options'

const none = {
    host: Option.none(),
    port: Option.none(),
    strictPort: false,
    noStrictPort: false,
    dataDir: Option.none(),
    logFormat: Option.none(),
}

describe('extractLogLevel', () => {
    test('removes both forms and keeps the last occurrence', () => {
        expect(extractLogLevel(['node', 'main', 'serve'])).toEqual({
            args: ['node', 'main', 'serve'],
            logLevel: undefined,
        })
        expect(
            extractLogLevel(['serve', '--log-level=debug', '--json', '--log-level', 'error']),
        ).toEqual({ args: ['serve', '--json'], logLevel: 'error' })
    })

    test('keeps a missing value detectable', () => {
        expect(extractLogLevel(['serve', '--log-level']).logLevel).toBe('')
    })
})

describe('toSettingFlags', () => {
    test('leaves absent options undefined so lower sources apply', () => {
        expect(toSettingFlags(none, undefined)).toEqual({
            host: undefined,
            port: undefined,
            strictPort: undefined,
            dataDir: undefined,
            logLevel: undefined,
            logFormat: undefined,
        })
    })

    test('maps the strict port flag pair', () => {
        expect(toSettingFlags({ ...none, strictPort: true }, undefined).strictPort).toBe(true)
        expect(toSettingFlags({ ...none, noStrictPort: true }, undefined).strictPort).toBe(false)
    })
})
