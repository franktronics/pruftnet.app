import type { BasicError, ErrorSeverity } from '@repo/shared/utils'
import { Alert, AlertDescription, AlertTitle, Button } from '@repo/ui'
import { cn } from '@repo/utils'
import { RotateCw } from 'lucide-react'

type BasicErrorViewModel = {
    title: string
    message?: string
    whatToDo?: string
    retryable: boolean
    severity: ErrorSeverity
}

type BasicErrorAlertProps = {
    error: unknown
    className?: string
    onRetry?: () => void
}

type BasicErrorToastProps = {
    error: unknown
}

export function BasicErrorAlert({ error, className, onRetry }: BasicErrorAlertProps) {
    const displayError = toBasicError(error)
    const hasDescription = hasErrorDescription(displayError)
    const canRetry = displayError.retryable && onRetry

    return (
        <Alert
            variant={displayError.severity === 'error' ? 'destructive' : 'default'}
            className={cn(
                {
                    'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200':
                        displayError.severity === 'warning',
                },
                className,
            )}
        >
            <AlertTitle>{displayError.title}</AlertTitle>
            {hasDescription ? (
                <AlertDescription>
                    {displayError.message ? displayError.message : null}
                    {displayError.whatToDo ? (
                        <>
                            <br />
                            {displayError.whatToDo}
                        </>
                    ) : null}
                </AlertDescription>
            ) : null}
            {canRetry ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRetry}
                    className="h-7 w-fit px-2 text-xs"
                >
                    <RotateCw className="size-3" />
                    Retry
                </Button>
            ) : null}
        </Alert>
    )
}

export function BasicErrorToast({ error }: BasicErrorToastProps) {
    const displayError = toBasicError(error)
    const hasDescription = hasErrorDescription(displayError)

    return (
        <div className="grid gap-1 text-sm">
            <p className="font-medium">{displayError.title}</p>
            {hasDescription ? (
                <div className="text-muted-foreground grid gap-1 text-xs leading-relaxed">
                    {displayError.message ? <p>{displayError.message}</p> : null}
                    {displayError.whatToDo ? <p>{displayError.whatToDo}</p> : null}
                </div>
            ) : null}
        </div>
    )
}

export function toBasicError(error: unknown): BasicErrorViewModel {
    if (isBasicError(error)) {
        return {
            title: error.title,
            message: error.message,
            whatToDo: error.whatToDo,
            retryable: error.retryable ?? false,
            severity: normalizeSeverity(error.severity),
        }
    }

    if (isRecord(error) && typeof error.message === 'string') {
        return {
            title: error.message || 'Unexpected error',
            retryable: false,
            severity: 'error',
        }
    }

    return {
        title: 'Unexpected error',
        retryable: false,
        severity: 'error',
    }
}

function isBasicError(error: unknown): error is Partial<BasicError> & { readonly title: string } {
    return isRecord(error) && typeof error.title === 'string'
}

function normalizeSeverity(severity: unknown): ErrorSeverity {
    return severity === 'warning' ? 'warning' : 'error'
}

function hasErrorDescription(error: BasicErrorViewModel) {
    return Boolean(error.message || error.whatToDo)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
