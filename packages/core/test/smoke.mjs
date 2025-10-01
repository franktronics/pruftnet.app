import { DateTime } from '../dist/index.js'

const info = DateTime.getInfo()
console.log('[core smoke] DateTime info:', info)
if (
    !info ||
    typeof info.iso !== 'string' ||
    typeof info.epochMs !== 'number' ||
    typeof info.timezone !== 'string'
) {
    console.error('Invalid DateTime info shape')
    process.exit(1)
}
