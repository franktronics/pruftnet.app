import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { resolveCaptureWorkerPath } from './worker-path'

describe('resolveCaptureWorkerPath', () => {
    test('finds the worker by walking up from an application directory', () => {
        const workspace = join('/workspace', 'pruftnet')
        const worker = join(workspace, 'packages/core/cpp/build/pruftnet_capture_worker')

        expect(
            resolveCaptureWorkerPath(
                join(workspace, 'apps/server'),
                undefined,
                'darwin',
                (candidate) => candidate === worker,
            ),
        ).toBe(worker)
    })

    test('resolves a relative override from the process directory', () => {
        expect(
            resolveCaptureWorkerPath(
                '/workspace/apps/server',
                '../../worker',
                'linux',
                () => false,
            ),
        ).toBe('/workspace/worker')
    })

    test('supports multi-config Windows CMake output', () => {
        const worker = join(
            '/workspace',
            'packages/core/cpp/build/Debug/pruftnet_capture_worker.exe',
        )
        expect(
            resolveCaptureWorkerPath(
                '/workspace/apps/desktop',
                undefined,
                'win32',
                (candidate) => candidate === worker,
            ),
        ).toBe(worker)
    })
})
