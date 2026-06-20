import { Schema } from 'effect'

const NetworkInterfaceBaseFields = {
    address: Schema.String,
    netmask: Schema.String,
    mac: Schema.String,
    internal: Schema.Boolean,
    cidr: Schema.NullOr(Schema.String),
}

export class NetworkInterfaceIPv4 extends Schema.Class<NetworkInterfaceIPv4>(
    'NetworkInterfaceIPv4',
)({
    ...NetworkInterfaceBaseFields,
    family: Schema.Literal('IPv4'),
}) {}

export class NetworkInterfaceIPv6 extends Schema.Class<NetworkInterfaceIPv6>(
    'NetworkInterfaceIPv6',
)({
    ...NetworkInterfaceBaseFields,
    family: Schema.Literal('IPv6'),
    scopeid: Schema.Number,
}) {}

export const NetworkInterfaceInfo = Schema.Union(NetworkInterfaceIPv4, NetworkInterfaceIPv6)

export const NetworkInterfacesSchema = Schema.Record({
    key: Schema.String,
    value: Schema.Array(NetworkInterfaceInfo),
})

export type NetworkInterfaceInfo = Schema.Schema.Type<typeof NetworkInterfaceInfo>
export type NetworkInterfaces = Schema.Schema.Type<typeof NetworkInterfacesSchema>
