import { rm } from 'node:fs'

const dirs = [
    './apps/web/dist',
    './apps/web/.turbo',
    './apps/desktop/dist',
    './apps/desktop/.vite',
    './apps/desktop/.turbo',
    './packages/ui/dist',
    './packages/core-cpp/dist',
    './packages/core-cpp/build',
    './pnpm-lock.yaml',
    './build',
]

const node_modules = [
    './apps/web/node_modules',
    './apps/desktop/node_modules',
    './packages/front/node_modules',
    './packages/ui/node_modules',
    './packages/utils/node_modules',
    './packages/core-cpp/node_modules',
    './packages/core-node/node_modules',
    './node_modules',
    '.turbo',
]

const preservemodules = process.argv.includes('--modules')

try {
    dirs.forEach((dir) => {
        rm(dir, { recursive: true, force: true }, (error) => {
            if (error) {
                console.error('Failed to remove the directory: ', dir)
                process.exit(1)
            }
        })
        console.log('removed: ', dir)
    })
    if (!preservemodules)
        node_modules.forEach((dir) => {
            rm(dir, { recursive: true, force: true }, (error) => {
                if (error) {
                    console.error('Failed to remove the directory: ', dir)
                    process.exit(1)
                }
            })
            console.log('removed: ', dir)
        })

    console.log('Cleaned up the project')
} catch (error) {
    console.error(error)
}
