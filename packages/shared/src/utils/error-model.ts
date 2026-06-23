import { Schema } from 'effect'

export const ErrorSeveritySchema = Schema.Literal('error', 'warning')

export const BasicErrorFields = {
    title: Schema.String,
    message: Schema.optional(Schema.String),
    whatToDo: Schema.optional(Schema.String),
    retryable: Schema.optional(Schema.Boolean),
    severity: Schema.optionalWith(ErrorSeveritySchema, { default: () => 'error' }),
}

export const BasicErrorSchema = Schema.Struct(BasicErrorFields)

export type ErrorSeverity = Schema.Schema.Type<typeof ErrorSeveritySchema>
export type BasicError = Schema.Schema.Type<typeof BasicErrorSchema>
