import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { FormInput } from './form-input'
import { FormSubBtn } from './form-subscribe-btn'
import { FormTextarea } from './form-textarea'

const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts()

const { useAppForm, withForm, withFieldGroup } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        FormInput,
        FormTextarea,
    },
    formComponents: {
        FormSubBtn,
    },
})

export { useAppForm, withForm, withFieldGroup, useFieldContext, useFormContext }
