import { Button } from '@repo/ui/atoms'

function Index() {
    async function handleStartSniffing() {
        try {
            const res = await fetch('/api/v1/start-sniff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nic: 'wlp1s0' }),
            })
            const data = await res.json()
            console.log("Result on front for start", data)
        } catch (err: any) {
            alert(`Error: ${err.message}`)
        }
    }

    async function handleStopSniffing() {
        try {
            const res = await fetch('/api/v1/stop-sniff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            const data = await res.json()
            console.log("Result on front for stop", data)
        } catch (err: any) {
            alert(`Error: ${err.message}`)
        }
    }

    return (
        <main>
            <div className="flex items-center gap-4 p-4">
                <h3>Result</h3>
            </div>
            <div className="space-x-4 p-10">
            <Button
                type='button'
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:bg-blue-800"
                onClick={handleStartSniffing}
            >
                Start sniffing
            </Button>
            <Button
                type='button'
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:bg-blue-800"
                onClick={handleStopSniffing}
            >
                Stop sniffing
            </Button>
        </div>
        </main>
    )
}

export default Index
