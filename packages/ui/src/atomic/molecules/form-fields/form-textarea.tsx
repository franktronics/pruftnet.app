import { ComponentProps, useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel, Textarea } from '../../atoms'
import { useFieldContext } from '.'

export type FormInputProps = {
    label: string
    description?: string
} & ComponentProps<typeof Textarea>
export function FormTextarea(props: FormInputProps) {
    const { label, description, ...rest } = props
    const field = useFieldContext<string>()
    const fieldId = useId()

    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
        <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
            <Textarea
                id={fieldId}
                value={field.state.value}
                name={field.name}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    field.handleChange(e.target.value)
                }
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                {...rest}
            />
            {!isInvalid && !!description ? (
                <FieldDescription>{description}</FieldDescription>
            ) : null}
            {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
        </Field>
    )
}
