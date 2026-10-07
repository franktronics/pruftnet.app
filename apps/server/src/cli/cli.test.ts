import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { releaseVersion } from '@repo/core'
import { describe, expect, test } from 'vitest'

const main = fileURLToPath(new URL('../main.ts', import.meta.url))

function cli(args: ReadonlyArray<string>, environment: Record<string, string> = {}) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', main, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PRUFTNET_CONFIG: '', ...environment },
        timeout: 30_000,
    })
    return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

// Each case starts a Node process with the TypeScript loader.
describe('server CLI', { timeout: 60_000 }, () => {
    test('prints help without a command', () => {
        const result = cli([])
        expect(result.code).toBe(0)
        expect(result.stdout).toContain('COMMANDS')
        expect(result.stdout).toContain('EXIT CODES')
    })

    test('prints the version', () => {
        expect(cli(['--version']).stdout.trim()).toBe(releaseVersion)
    })

    test('exits with the usage code on invalid input', () => {
        expect(cli(['serve', '--port', 'abc']).code).toBe(2)
        expect(cli(['unknown']).code).toBe(2)
        const remote = cli(['config', 'show', '--host', '0.0.0.0'])
        expect(remote.code).toBe(2)
        expect(remote.stderr).toContain('loopback')
        expect(cli(['config', 'show'], { PRUFTNET_CONFIG: '/missing/server.json' }).code).toBe(2)
        expect(cli(['config', 'show', '--log-level', 'loud']).code).toBe(2)
    })

    test('reports effective settings with their sources', () => {
        const result = cli(['config', 'show', '--json', '-p', '4000', '--log-level', 'debug'], {
            PRUFTNET_LOG_FORMAT: 'json',
        })
        expect(result.code).toBe(0)
        const { settings } = JSON.parse(result.stdout)
        expect(settings.port).toEqual({ value: 4000, source: 'flag' })
        expect(settings.logLevel).toEqual({ value: 'debug', source: 'flag' })
        expect(settings.logFormat).toEqual({ value: 'json', source: 'environment' })
    })
})
