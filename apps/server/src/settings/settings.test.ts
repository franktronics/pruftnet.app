import { resolve } from 'node:path'

import { Either } from 'effect'
import { describe, expect, test } from 'vitest'

import {
    defaultConfigFilePath,
    parseConfigFile,
    resolveSettings,
    type ResolveSettingsInput,
    type SettingValues,
} from './settings'

const defaults: SettingValues = {
    host: '127.0.0.1',
    port: 3000,
    dataDir: '/default/data',
    logLevel: 'info',
    logFormat: 'pretty',
    strictPort: false,
}

function resolveWith(input: Partial<ResolveSettingsInput>) {
    return resolveSettings({
        flags: {},
        environment: {},
        file: undefined,
        defaults,
        cwd: '/work',
        ...input,
    })
}

function resolved(input: Partial<ResolveSettingsInput>) {
    return Either.getOrThrow(resolveWith(input))
}

function failure(input: Partial<ResolveSettingsInput>) {
    const result = resolveWith(input)
    if (Either.isRight(result)) throw new Error('Expected settings to be rejected')
    return result.left
}

const file = (values: Record<string, unknown>) => ({ path: '/etc/pruftnet/server.json', values })

describe('resolveSettings', () => {
    test('uses defaults without any source', () => {
        const settings = resolved({})
        expect(settings.port).toEqual({ value: 3000, source: 'default' })
        expect(settings.configFile).toBeUndefined()
    })

    test('applies flag > environment > file > default precedence', () => {
        const environment = { PRUFTNET_PORT: '4000', PRUFTNET_LOG_FORMAT: 'json' }
        const configFile = file({ port: 5000, logFormat: 'logfmt', logLevel: 'debug' })
        const settings = resolved({ flags: { port: 6000 }, environment, file: configFile })

        expect(settings.port).toEqual({ value: 6000, source: 'flag' })
        expect(settings.logFormat).toEqual({ value: 'json', source: 'environment' })
        expect(settings.logLevel).toEqual({ value: 'debug', source: 'file' })
        expect(settings.host).toEqual({ value: '127.0.0.1', source: 'default' })
        expect(settings.configFile).toBe('/etc/pruftnet/server.json')
    })

    test('ignores empty environment variables', () => {
        expect(resolved({ environment: { PRUFTNET_PORT: '' } }).port.source).toBe('default')
    })

    test('rejects remote hosts from every source', () => {
        for (const host of [
            '0.0.0.0',
            '192.168.1.1',
            '127.attacker.example',
            '127.0.0.1.example',
        ]) {
            expect(failure({ flags: { host } }).message).toContain('--host')
            expect(failure({ environment: { PRUFTNET_HOST: host } }).message).toContain(
                'PRUFTNET_HOST',
            )
            expect(failure({ file: file({ host }) }).message).toContain('"host" in')
        }
        for (const host of ['127.0.0.1', 'localhost', '::1']) {
            expect(resolved({ flags: { host } }).host.value).toBe(host)
        }
    })

    test('rejects malformed, fractional and out-of-range ports', () => {
        for (const port of [Number.NaN, 0, -1, 65536, 3000.5, '3000']) {
            expect(failure({ flags: { port } }).exitCode).toBe(2)
        }
        for (const port of ['abc', '0', '65536', '3000.5', 'Infinity']) {
            expect(failure({ environment: { PRUFTNET_PORT: port } }).message).toContain(
                'expected an integer between 1 and 65535',
            )
        }
        expect(resolved({ environment: { PRUFTNET_PORT: '65535' } }).port.value).toBe(65535)
    })

    test('parses boolean environment variables strictly', () => {
        expect(resolved({ environment: { PRUFTNET_STRICT_PORT: '1' } }).strictPort.value).toBe(true)
        expect(resolved({ environment: { PRUFTNET_STRICT_PORT: 'false' } }).strictPort.value).toBe(
            false,
        )
        expect(failure({ environment: { PRUFTNET_STRICT_PORT: 'yes' } }).message).toContain(
            'true or false',
        )
    })

    test('resolves relative data directories from their source', () => {
        expect(resolved({ flags: { dataDir: 'data' } }).dataDir.value).toBe(resolve('/work/data'))
        expect(resolved({ file: file({ dataDir: '../data' }) }).dataDir.value).toBe(
            resolve('/etc/data'),
        )
        expect(resolved({ file: file({ dataDir: '/srv/data' }) }).dataDir.value).toBe('/srv/data')
    })
})

describe('parseConfigFile', () => {
    test('accepts known settings', () => {
        const parsed = Either.getOrThrow(parseConfigFile('/c.json', '{"port": 4000}'))
        expect(parsed.values).toEqual({ port: 4000 })
    })

    test('rejects invalid JSON, non-objects and unknown keys', () => {
        for (const text of ['{', '[]', 'null', '3', '{"prot": 1}']) {
            const result = parseConfigFile('/c.json', text)
            expect(Either.isLeft(result) && result.left.exitCode).toBe(2)
        }
        const unknown = parseConfigFile('/c.json', '{"prot": 1}')
        expect(Either.isLeft(unknown) && unknown.left.message).toContain('"prot"')
    })
})

describe('defaultConfigFilePath', () => {
    const base = {
        mode: 'production' as const,
        workspaceRoot: '/repo',
        environment: {},
        home: '/home/user',
    }

    test('follows platform conventions', () => {
        expect(defaultConfigFilePath({ ...base, platform: 'linux' })).toBe(
            resolve('/home/user/.config/pruftnet/server.json'),
        )
        expect(
            defaultConfigFilePath({
                ...base,
                platform: 'linux',
                environment: { XDG_CONFIG_HOME: '/xdg' },
            }),
        ).toBe(resolve('/xdg/pruftnet/server.json'))
        expect(defaultConfigFilePath({ ...base, platform: 'darwin' })).toBe(
            resolve('/home/user/Library/Application Support/Pruftnet/server.json'),
        )
        expect(
            defaultConfigFilePath({
                ...base,
                platform: 'win32',
                environment: { APPDATA: '/appdata' },
            }),
        ).toBe(resolve('/appdata/Pruftnet/server.json'))
    })

    test('keeps development configuration in the workspace', () => {
        expect(defaultConfigFilePath({ ...base, mode: 'development', platform: 'linux' })).toBe(
            resolve('/repo/.data/pruftnet/server.json'),
        )
    })
})
