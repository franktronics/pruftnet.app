import { symlink, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('packages/core-cpp/build/Release/repo-core.node')
const target = resolve('apps/desktop/build/Release/repo-core.node')

if (!existsSync(resolve('apps/desktop/build/Release'))) {
    mkdirSync(resolve('apps/desktop/build/Release'), { recursive: true })
}

if (!existsSync(target) && existsSync(source)) {
    symlink(source, target, 'file', (err) => {
        if (err) {
            console.error('Failed to create symlink:', err)
        } else {
            console.log('✓ Created symlink for native addon')
        }
    })
}
