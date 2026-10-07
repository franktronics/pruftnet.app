/**
 * Evaluates a series of conditions and returns the result associated with the first true condition.
 * If no conditions are true, it returns undefined.
 * Example usage:
 * ```ts
 * const result = cond(
 *  [condition1, result1],
 *  [condition2, result2],
 *  [condition3, result3],
 *  )
 *
 * @param cases An array of tuples where each tuple contains a boolean condition and its associated result.
 * @returns The result associated with the first true condition, or undefined if none are true.
 */
export function cond<T>(...cases: [boolean, T][]): T | undefined {
    for (const [condition, result] of cases) {
        if (condition) return result
    }
    return undefined
}
