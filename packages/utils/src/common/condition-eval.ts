export function cond<T>(...cases: [boolean, T][]): T | undefined {
    for (const [condition, result] of cases) {
        if (condition) return result
    }
    return undefined
}
