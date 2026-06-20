import { Schema } from 'effect'

export class InterfacesNotFound extends Schema.TaggedError<InterfacesNotFound>()(
    'InterfacesNotFound',
    {
        message: Schema.String,
    },
) {}
