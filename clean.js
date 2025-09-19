import { rm } from 'node:fs'

const dirs = [
    './apps/web/dist',
    './apps/web/.vite',
    './packages/ui/dist',
    './packages/tailwind-config/dist',
    '.turbo',
]

const node_modules = [
    './apps/web/node_modules',
    './packages/ui/node_modules',
    './packages/utils/node_modules',
    './node_modules',
]

const removeAll = process.argv.includes('--all')

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
    if (removeAll)
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
