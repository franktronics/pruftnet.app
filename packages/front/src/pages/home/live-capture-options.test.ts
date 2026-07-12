import { describe, expect, test } from 'vitest'

import { buildLiveCaptureSource } from './live-capture-options'

describe('buildLiveCaptureSource', () => {
    test('builds bounded per-interface live options', () => {
        const source = buildLiveCaptureSource(
            {
                en0: {
                    promiscuous: true,
                    monitorMode: false,
                    linkType: 1,
                    timestampType: 'host',
                },
                lo0: {
                    promiscuous: false,
                    monitorMode: false,
                    linkType: null,
                    timestampType: null,
                },
            },
            {
                bpfFilter: '  tcp port 443  ',
                snaplen: 65_535,
                bufferMiB: 8,
                ringSlots: 1024,
            },
        )

        expect(source).toMatchObject({
            _tag: 'Live',
            bpfFilter: 'tcp port 443',
            pcapBufferSizeBytes: 8 * 1024 * 1024,
            interfaces: [
                { name: 'en0', promiscuous: true, linkType: 1, timestampType: 'host' },
                { name: 'lo0', promiscuous: false },
            ],
        })
    })

    test('rejects an empty selection', () => {
        expect(() =>
            buildLiveCaptureSource(
                {},
                { bpfFilter: '', snaplen: 65_535, bufferMiB: 8, ringSlots: 1024 },
            ),
        ).toThrow('At least one capture interface')
    })
})
