const readline = require('node:readline')

readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line)
    setTimeout(
        () => process.stdout.write(JSON.stringify({ v: 1, id: request.id, ok: true }) + '\n'),
        25,
    )
})
