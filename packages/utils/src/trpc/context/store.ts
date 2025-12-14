export abstract class Store<Key extends string = string, Val = any> {
    abstract get(key: Key): Val | undefined
    abstract set(key: Key, value: Val): void
    abstract has(key: Key): boolean
    abstract delete(key: Key): void
    abstract clear(): void
}
