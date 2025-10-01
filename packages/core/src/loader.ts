import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const nodeGypBuild = require('node-gyp-build') as (p: string) => any

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load compiled native addon (.node) built by node-gyp from the package root
const pkgRoot = join(__dirname, '..')
const binding = nodeGypBuild(pkgRoot)

export default binding as {
    datetime: {
        getDateTimeInfo(): { iso: string; epochMs: number; timezone: string }
    }
}
