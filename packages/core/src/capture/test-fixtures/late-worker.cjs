let input = Buffer.alloc(0)
const cancelled = []
const { writeFileSync } = require('node:fs')

function writeFrame(value) {
    const body = Buffer.from(JSON.stringify(value))
    const header = Buffer.alloc(4)
    header.writeUInt32LE(body.byteLength)
    process.stdout.write(Buffer.concat([header, body]))
}

process.stdin.on('data', (chunk) => {
    input = Buffer.concat([input, chunk])
    while (input.byteLength >= 4) {
        const length = input.readUInt32LE(0)
        if (input.byteLength < 4 + length) return
        const request = JSON.parse(input.subarray(4, 4 + length).toString('utf8'))
        input = input.subarray(4 + length)
        if (request.op === 'cancel') {
            cancelled.push(request.target)
            continue
        }
        if (request.op === 'detail') writeFileSync(request.testPath, 'PRT2')
        setTimeout(
            () =>
                writeFrame({
                    v: 2,
                    kind: 'response',
                    id: request.id,
                    ok: true,
                    op: request.op,
                    cancelled,
                    features: process.argv.includes('--legacy') ? [] : ['detailCancellation'],
                    ...(request.op === 'detail' ? { dataPath: request.testPath } : {}),
                }),
            request.op === 'slow' || request.op === 'detail' ? 100 : 0,
        )
    }
})
