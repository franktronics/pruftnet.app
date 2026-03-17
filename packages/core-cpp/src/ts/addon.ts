import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

let addon: any

// Get resources path from environment (set by main.ts in Electron) or process.resourcesPath
const resourcesPath = process.env.RESOURCES_PATH || (process as any).resourcesPath
const isPackaged = process.env.IS_PACKAGED === 'true'

// Order matters: prioritize packaged paths when running in production
const possiblePaths = [
    // Production packaged app - highest priority
    ...(resourcesPath ? [join(resourcesPath, 'repo-core.node')] : []),
    // Development - relative to dist/ts/addon.js
    join(__dirname, '../../build/Release/repo-core.node'),
    // Development - from workspace root
    resolve(process.cwd(), 'packages/core-cpp/build/Release/repo-core.node'),
    // Fallback - deep relative path
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
