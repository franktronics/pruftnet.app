import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps, toast } from 'sonner'
import { useTheme } from '../../molecules'

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme()

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            icons={{
                success: <CircleCheckIcon className="text-chart-11 size-4" />,
                info: <InfoIcon className="text-chart-3 size-4" />,
                warning: <TriangleAlertIcon className="text-chart-4 size-4" />,
                error: <OctagonXIcon className="text-destructive size-4" />,
                loading: <Loader2Icon className="size-4 animate-spin" />,
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                } as React.CSSProperties
            }
            {...props}
        />
    )
}

export { Toaster, toast }
