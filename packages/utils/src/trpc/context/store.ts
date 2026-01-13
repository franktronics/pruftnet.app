export abstract class Store<Key, Val = any> {
    abstract get(key: Key): Val | undefined
    abstract getByIndex(index: number): Val | undefined
    abstract set(key: Key, value: Val): void
    abstract has(key: Key): boolean
    abstract size(): number
    abstract toArray(): Array<[Key, Val]>
    abstract toObject(): Record<string, any>
    abstract delete(key: Key): void
    abstract clear(): void
}
