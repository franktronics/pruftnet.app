import assert from 'node:assert/strict'
import { test } from 'node:test'
import { channelAsset, installGuide, metadata } from './common.mjs'

test('release identities isolate names and commands', () => {
    const main = metadata({ PRUFTNET_VERSION: '0.2.0' })
    const nightly = metadata({ PRUFTNET_VERSION: '0.2.1-nightly.20260911.42' })
    assert.equal(main.command, 'pruftnet')
    assert.equal(nightly.command, 'pruftnet-nightly')
    assert.notEqual(main.name, nightly.name)
    assert.equal(main.appId, 'app.pruftnet.desktop')
    assert.equal(nightly.appId, 'app.pruftnet.desktop.nightly')
})
test('channel assets keep stable paths and suffix nightly ones', () => {
    const main = metadata({ PRUFTNET_VERSION: '0.2.1' })
    const nightly = metadata({ PRUFTNET_VERSION: '0.2.1-nightly.20261008.1' })
    assert.equal(channelAsset('assets/icons/icon.icns', main), 'assets/icons/icon.icns')
    assert.equal(channelAsset('assets/icons/icon.icns', nightly), 'assets/icons/icon-nightly.icns')
    assert.equal(
        channelAsset('assets/dmg/background.png', nightly),
        'assets/dmg/background-nightly.png',
    )
})
test('rejects invalid versions and conflicting channels', () => {
    for (const version of ['../file', '1.0.0', '0.2', '0.2.0;echo nope']) {
        assert.throws(() => metadata({ PRUFTNET_VERSION: version }))
    }
    assert.throws(() => metadata({ PRUFTNET_VERSION: '0.2.0', PRUFTNET_CHANNEL: 'nightly' }))
})
test('install guide is the README install section', () => {
    const guide = installGuide(
        '# Pruftnet\n\n## Install\n\nDownload.\n\n### Capture permissions\n\nGrant.\n\n## Development\n\nNo.\n',
    )
    assert.equal(guide, '# Install Pruftnet\n\nDownload.\n\n### Capture permissions\n\nGrant.\n')
    assert.throws(() => installGuide('# Pruftnet\n'))
    assert.equal(
        installGuide('## Install\r\n\r\nDownload.\r\n\r\n## Next\r\n'),
        '# Install Pruftnet\n\nDownload.\n',
    )
    assert.match(installGuide(), /### Capture permissions/)
})
