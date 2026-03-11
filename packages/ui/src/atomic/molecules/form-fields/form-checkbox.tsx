import { ComponentProps, useId } from 'react'
import {
    Checkbox,
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '../../atoms'
import { useFieldContext } from './index'

export type FormCheckboxProps = {
    label: string
    description?: string
} & Omit<ComponentProps<typeof Checkbox>, 'checked' | 'onCheckedChange'>

export function FormCheckbox(props: FormCheckboxProps) {
    const { label, description, ...rest } = props
    const field = useFieldContext<boolean>()
    const fieldId = useId()
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
        <Field orientation="horizontal" data-invalid={isInvalid} className="items-start gap-3">
            <Checkbox
                id={fieldId}
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                className="mt-0.5"
                {...rest}
            />
            <FieldContent>
                <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
                {!isInvalid && !!description ? (
                    <FieldDescription>{description}</FieldDescription>
                ) : null}
                {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
            </FieldContent>
        </Field>
    )
}
