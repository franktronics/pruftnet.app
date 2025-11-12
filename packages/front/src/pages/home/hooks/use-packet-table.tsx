export type RowDataType = {
    index: number
    time: string
    src: string
    dest: string
    protocol: string
    length: number
    info: string
}

export type PacketTableHookReturn = {
    data: RowDataType[]
}

export const usePacketTable = (): PacketTableHookReturn => {
    return {
        data: packets_data,
    }
}

const packets_data = Array.from({ length: 1000 }, (_, i) => ({
    index: i + 1,
    time: (Math.random() * 100).toFixed(6),
    src: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    dest: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    protocol: Math.random() > 0.5 ? 'TCP' : 'UDP',
    length: Math.floor(Math.random() * 1500) + 20,
    info: `${Math.floor(Math.random() * 65535)} -> ${Math.floor(
        Math.random() * 65535,
    )} Len=${Math.floor(Math.random() * 1500) + 20}`,
}))
