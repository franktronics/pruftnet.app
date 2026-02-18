import { Store } from './store'

export class MapStore<Key, Val> extends Store<Key, Val> {
    private store: Map<Key, Val> = new Map()
    private keysArray: Key[] = []

    override get(key: Key): Val | undefined {
        return this.store.get(key)
    }
    override getByIndex(index: number): Val | undefined {
        const key = this.keysArray[index]
        if (key === undefined) return undefined
        return this.store.get(key)
    }

    override getKeyByIndex(index: number): Key | undefined {
        return this.keysArray[index]
    }
    override getIndexByKey(key: Key): number | undefined {
        const index = this.keysArray.indexOf(key)
        return index === -1 ? undefined : index
    }

    override set(key: Key, value: Val): void {
        if (!this.store.has(key)) {
            this.keysArray.push(key)
        }
        this.store.set(key, value)
    }
    override delete(key: Key): void {
        if (this.store.has(key)) {
            const index = this.keysArray.indexOf(key)
            if (index > -1) {
                this.keysArray.splice(index, 1)
            }
            this.store.delete(key)
        }
    }
    override clear(): void {
        this.store.clear()
        this.keysArray = []
    }

    override has(key: Key): boolean {
        return this.store.has(key)
    }
    override size(): number {
        return this.store.size
    }

    override toArray(): [Key, Val][] {
        return this.keysArray.map((key) => [key, this.store.get(key)!])
    }
    override toObject(): Record<string, any> {
        const obj: Record<string, any> = {}
        for (const key of this.keysArray) {
            if (typeof key === 'string' || typeof key === 'number' || typeof key === 'symbol') {
                obj[String(key)] = this.store.get(key)
            }
        }
        return obj
    }
}
