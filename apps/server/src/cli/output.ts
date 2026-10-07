import { Console } from 'effect'

/** Left-aligned columns separated by two spaces, without trailing whitespace. */
export function formatTable(rows: ReadonlyArray<ReadonlyArray<string>>) {
    const widths: number[] = []
    for (const row of rows) {
        row.forEach((cell, index) => {
            widths[index] = Math.max(widths[index] ?? 0, cell.length)
        })
    }
    return rows
        .map((row) =>
            row
                .map((cell, index) =>
                    index === row.length - 1 ? cell : cell.padEnd(widths[index]!),
                )
                .join('  ')
                .trimEnd(),
        )
        .join('\n')
}

export const printJson = (value: unknown) => Console.log(JSON.stringify(value, null, 2))
