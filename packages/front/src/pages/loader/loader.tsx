import { useEffect, useMemo, type ComponentProps } from 'react'
import { LoaderBar } from './components/loaderbar'
import { useSettingsContext } from '../settings/context/settings-context'
import { useLoaderSteps } from './hooks/use-loader-steps'

export function AppLoader(props: ComponentProps<'div'>) {
    const { children, ...rest } = props
    const { getSettings, appSettings } = useSettingsContext()

    const steps = useMemo(
        () => [
            { stepFn: getSettings, text: 'Loading settings...' },
            { stepFn: async () => true, text: '' },
        ],
        [getSettings],
    )

    const { state, runSteps, completed } = useLoaderSteps({ steps })

    useEffect(() => {
        if (Object.entries(appSettings).length !== 0) {
            return
        }
        void runSteps()
    }, [runSteps])

    const isComplete = completed && !state.error

    if (isComplete) {
        return <>{children}</>
    }

    return (
        <div {...rest}>
            <LoaderBar
                actualStep={state.currentStep.index}
                totalSteps={state.totalSteps}
                text={state.currentStep.text}
                error={state.error}
            />
        </div>
    )
}
