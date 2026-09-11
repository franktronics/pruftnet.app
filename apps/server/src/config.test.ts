import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadServerConfig } from './config'

test('rejects remote hosts including loopback-looking hostnames', () => {
    for (const host of ['0.0.0.0', '192.168.1.1', '127.attacker.example', '127.0.0.1.example']) {
        assert.throws(() => loadServerConfig({ host, port: 3000 }))
    }
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
        assert.equal(loadServerConfig({ host, port: 3000 }).host, host)
    }
})

test('rejects malformed, fractional and out-of-range ports', () => {
    for (const port of [NaN, 0, -1, 65536, 3000.5]) {
        assert.throws(() => loadServerConfig({ host: '127.0.0.1', port }))
    }
    assert.equal(loadServerConfig({ host: '127.0.0.1', port: 65535 }).port, 65535)
})
