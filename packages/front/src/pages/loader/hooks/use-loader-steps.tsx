import { type ClientErrorType } from '@repo/utils'
import { useCallback, useState } from 'react'

export type LoaderStep = {
    stepFn: () => Promise<boolean | Error | ClientErrorType>
    text: string
}

export type LoaderStepsProps = {
    steps: Array<LoaderStep>
}

export const useLoaderSteps = (props: LoaderStepsProps) => {
    const { steps } = props
    const [state, setState] = useState({
        currentStep: { index: 0, text: '' },
        totalSteps: steps.length,
        error: undefined as Error | ClientErrorType | undefined,
    })
    const [completed, setCompleted] = useState(false)

    const handleRun = useCallback(async () => {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            setState((prev) => ({
                ...prev,
                currentStep: { index: i + 1, text: step.text },
                error: undefined,
            }))
            try {
                const result = await step.stepFn()
                if (result instanceof Error) {
                    setState((prev) => ({ ...prev, error: result }))
                    return
                }
                if (i === steps.length - 1) {
                    const timer = setTimeout(() => {
                        setCompleted(true)
                        clearTimeout(timer)
                    }, 500)
                }
            } catch (error) {
                setState((prev) => ({
                    ...prev,
                    error: error as Error | ClientErrorType,
                }))
                return
            }
        }
    }, [steps])

    return {
        runSteps: handleRun,
        state,
        completed,
    }
}
