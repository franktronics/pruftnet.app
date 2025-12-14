export default class ScanController {
    async startScan(id: string): Promise<{ message: string }> {
        const timer = (ms: number) => new Promise((res) => setTimeout(res, ms))
        await timer(5000)
        return { message: `Scan started for id: ${id}` }
    }

    async stopScan(id: string): Promise<{ message: string }> {
        return { message: `Scan stopped for id: ${id}` }
    }
}
