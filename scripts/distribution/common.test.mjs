import assert from 'node:assert/strict'
import { test } from 'node:test'
import { metadata } from './common.mjs'

test('release identities isolate names and commands', () => {
    const main = metadata({ PRUFTNET_VERSION: '0.2.0' })
    const nightly = metadata({ PRUFTNET_VERSION: '0.2.1-nightly.20260911.42' })
    assert.equal(main.command, 'pruftnet')
    assert.equal(nightly.command, 'pruftnet-nightly')
    assert.notEqual(main.name, nightly.name)
})
test('rejects invalid versions and conflicting channels', () => {
    for (const version of ['../file', '1.0.0', '0.2', '0.2.0;echo nope']) {
        assert.throws(() => metadata({ PRUFTNET_VERSION: version }))
    }
    assert.throws(() => metadata({ PRUFTNET_VERSION: '0.2.0', PRUFTNET_CHANNEL: 'nightly' }))
})
