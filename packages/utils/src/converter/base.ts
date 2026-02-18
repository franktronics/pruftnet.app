export class BaseConverter {
    /*
     * Formats a byte (number) to a two-character hexadecimal string.
     * Example: 255 -> "FF", 5 -> "05"
     */
    static formatHex(byte: number): string {
        return byte.toString(16).padStart(2, '0').toUpperCase()
    }

    /*
     * Formats a byte (number) to its ASCII representation.
     * Non-printable characters (outside the range 32-126) are represented as a dot ('.').
     * Example: 65 -> "A", 10 -> "."
     */
    static formatAscii(byte: number): string {
        return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
    }
}
