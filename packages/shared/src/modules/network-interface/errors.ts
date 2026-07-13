import { Schema } from 'effect'
import { BasicErrorFields } from '#shared/utils/error-model'

export class InterfacesNotFound extends Schema.TaggedError<InterfacesNotFound>()(
    'InterfacesNotFound',
    BasicErrorFields,
) {}
