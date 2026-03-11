import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { FormCheckbox } from './form-checkbox'
import { FormInput } from './form-input'
import { FormMultiHostSelect } from './form-multi-host-select'
import { FormSubBtn } from './form-subscribe-btn'
import { FormTextarea } from './form-textarea'

const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts()

const { useAppForm, withForm, withFieldGroup } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        FormCheckbox,
        FormInput,
        FormMultiHostSelect,
        FormTextarea,
    },
    formComponents: {
        FormSubBtn,
    },
})

export { useAppForm, withForm, withFieldGroup, useFieldContext, useFormContext }
