import { Button } from '@repo/ui/atoms'
import { Link } from '@tanstack/react-router'

function Error404() {
    return (
        <div className="relative -top-16 flex h-full flex-col items-center justify-center gap-4">
            <h1 className="text-6xl">Error :(</h1>
            <Button asChild>
                <Link to="/">Go to Home</Link>
            </Button>
        </div>
    )
}

export default Error404
