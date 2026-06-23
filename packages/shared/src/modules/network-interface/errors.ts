import { Schema } from 'effect'
import { BasicErrorFields } from '#/utils'

export class InterfacesNotFound extends Schema.TaggedError<InterfacesNotFound>()(
    'InterfacesNotFound',
    BasicErrorFields,
) {}
