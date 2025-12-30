import { cn, type ClientErrorType } from '@repo/utils'
import type { ComponentProps } from 'react'
import { trpcClient } from '@repo/utils'
import { Alert, AlertTitle, AlertDescription, Card, CardContent, Progress } from '@repo/ui/atoms'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

const { ClientError } = trpcClient

export type LoaderBarProps = {
    actualStep: number
    totalSteps: number
    text: string
    error?: ClientErrorType | Error
} & ComponentProps<'div'>

export const LoaderBar = (props: LoaderBarProps) => {
    const { className, actualStep, totalSteps, text, error, ...rest } = props

    const progress = Math.min((actualStep / totalSteps) * 100, 100)
    const isComplete = actualStep >= totalSteps && !error

    return (
        <div
            className={cn(
                'bg-background flex min-h-screen w-full items-center justify-center p-6',
                className,
            )}
            {...rest}
        >
            <Card className="w-full max-w-lg">
                <CardContent>
                    <div className="flex flex-col items-center space-y-1 pb-4">
                        <h1 className="text-2xl font-bold tracking-tight">Pruftnet</h1>
                        <p className="text-muted-foreground text-sm">Network Analysis Tool</p>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                            {isComplete ? 'Loading complete' : text}
                            <CheckCircle2 className="size-4" />
                        </span>
                        <span className="text-muted-foreground font-medium">
                            {actualStep} / {totalSteps}
                        </span>
                    </div>

                    <Progress value={progress} className="mt-2 mb-4" />

                    {error && <ErrorDisplay error={error} />}
                </CardContent>
            </Card>
        </div>
    )
}

type ErrorDisplayProps = {
    error: ClientErrorType | Error
}

const ErrorDisplay = ({ error }: ErrorDisplayProps) => {
    const isClientError = error instanceof ClientError

    if (isClientError) {
        const errorData = error.getErrorData()
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold">
                    {errorData.message}
                    {errorData.code && (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                            [CODE: {errorData.code}]
                        </span>
                    )}
                </AlertTitle>
                <AlertDescription>
                    {errorData.whatToDo && <p className="">{errorData.whatToDo}</p>}
                    {errorData.origin && (
                        <p className="text-muted-foreground text-xs">ORIGIN: {errorData.origin}</p>
                    )}
                </AlertDescription>
            </Alert>
        )
    }

    return (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-semibold">An error occurred</AlertTitle>
            <AlertDescription>
                <p>{error.message || 'An unexpected error occurred during loading'}</p>
            </AlertDescription>
        </Alert>
    )
}
