import { useState } from 'react'

const App = () => {
    const [result, setResult] = useState<string>('nothing')

    async function getHelloWorld() {
        try {
            const res = await fetch('/api/hello')
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: { message?: string } = await res.json()
            setResult(data.message ?? 'no message')
        } catch (err: any) {
            setResult(`error: ${err?.message ?? String(err)}`)
        }
    }

    return (
        <div className="space-x-4 p-10">
            <p className="font-medium">{result}</p>
            <button
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:bg-blue-800"
                onClick={getHelloWorld}
            >
                Get Hello
            </button>
        </div>
    )
}

export default App
