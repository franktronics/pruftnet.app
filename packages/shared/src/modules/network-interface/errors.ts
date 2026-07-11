import { Schema } from 'effect'
import { BasicErrorFields } from '../../utils/error-model'

export class InterfacesNotFound extends Schema.TaggedError<InterfacesNotFound>()(
    'InterfacesNotFound',
    BasicErrorFields,
) {}
