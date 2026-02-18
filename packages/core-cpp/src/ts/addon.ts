import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

let addon: any

const possiblePaths = [
    join(__dirname, '../../build/Release/repo-core.node'),
    resolve(process.cwd(), 'packages/core-cpp/build/Release/repo-core.node'),
    join((process as any).resourcesPath || '', 'repo-core.node'),
    resolve(__dirname, '../../../../../packages/core-cpp/build/Release/repo-core.node'),
]

for (const addonPath of possiblePaths) {
    if (existsSync(addonPath)) {
        try {
            addon = require(addonPath)
            console.log(`✓ Native addon loaded: ${addonPath}`)
            break
        } catch (error) {
            console.warn(`✗ Failed to load ${addonPath}:`, error)
        }
    }
}

if (!addon) {
    const pathList = possiblePaths
        .map((p, i) => `  ${i + 1}. ${p} ${existsSync(p) ? '(exists)' : '(not found)'}`)
        .join('\n')
    throw new Error(`Could not load native addon.\n\nTried paths:\n${pathList}`)
}

export default addon
