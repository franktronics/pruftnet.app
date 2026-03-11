import type { HostBaseData } from '@repo/utils'
import { cn } from '@repo/utils'
import {
    Badge,
    Button,
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@repo/ui/atoms'
import { useAppForm, withForm } from '@repo/ui/molecules'
import { Funnel } from 'lucide-react'
import { useEffect, type ComponentProps } from 'react'

export type HostFilterProps = {
    hostData: Map<string, HostBaseData>
    excludedHostMacs: string[]
    onChangeExcludedHostMacs: (excludedMacs: string[]) => void
} & ComponentProps<'div'>

type HostFilterFormValues = {
    excludedHostMacs: string[]
}

export const HostFilter = (props: HostFilterProps) => {
    const { hostData, excludedHostMacs, onChangeExcludedHostMacs, className, ...rest } = props

    const form = useAppForm({
        defaultValues: {
            excludedHostMacs,
        } satisfies HostFilterFormValues,
        onSubmit: async () => true,
    })

    useEffect(() => {
        form.setFieldValue('excludedHostMacs', excludedHostMacs)
    }, [excludedHostMacs])

    return (
        <div className={cn(className)} {...rest}>
            <Drawer direction="right">
                <DrawerTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 shadow-sm">
                        <Funnel className="size-4" />
                        Host filters
                        {excludedHostMacs.length > 0 ? (
                            <Badge variant="secondary" className="ml-1 px-2 py-0 text-[11px]">
                                {excludedHostMacs.length}
                            </Badge>
                        ) : null}
                    </Button>
                </DrawerTrigger>
                <DrawerContent className="h-full w-[min(92vw,30rem)] rounded-l-2xl border-l p-0 sm:max-w-none">
                    <DrawerHeader className="border-b px-6 py-5 text-left">
                        <DrawerTitle>Host filters</DrawerTitle>
                        <DrawerDescription>
                            Apply some filters and rebuild the graph automatically.
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="no-scrollbar space-y-6 overflow-y-auto px-6 py-6">
                        <HostFilterForm
                            form={form}
                            hostData={hostData}
                            onChangeExcludedHostMacs={onChangeExcludedHostMacs}
                        />
                    </div>

                    <DrawerFooter className="border-t px-6 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => onChangeExcludedHostMacs([])}
                            disabled={excludedHostMacs.length === 0}
                        >
                            Reset filters
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </div>
    )
}

const HostFilterForm = withForm({
    defaultValues: {
        excludedHostMacs: [] as string[],
    },
    props: {} as {
        hostData: Map<string, HostBaseData>
        onChangeExcludedHostMacs: (excludedMacs: string[]) => void
    },
    render: function Render(props) {
        const { form, hostData, onChangeExcludedHostMacs } = props

        return (
            <section className="space-y-4">
                <form.AppField
                    name="excludedHostMacs"
                    listeners={{
                        onChange: ({ value }) => {
                            onChangeExcludedHostMacs(value)
                        },
                    }}
                    children={(field) => (
                        <field.FormMultiHostSelect
                            label="Hidden hosts"
                            description="Select one or more hosts to exclude from the graph view."
                            hosts={hostData}
                            placeholder="Choose hosts to hide"
                        />
                    )}
                />
            </section>
        )
    },
})
