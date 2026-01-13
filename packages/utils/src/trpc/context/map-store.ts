import { Store } from './store'

export class MapStore<Key, Val> extends Store<Key, Val> {
    private store: Map<Key, Val> = new Map()

    get(key: Key): Val | undefined {
        return this.store.get(key)
    }

    getByIndex(index: number): Val | undefined {
        const iterator = this.store.values()
        let currentIndex = 0
        let result = iterator.next()
        while (!result.done) {
            if (currentIndex === index) {
                return result.value
            }
            currentIndex++
            result = iterator.next()
        }
        return undefined
    }

    set(key: Key, value: Val): void {
        this.store.set(key, value)
    }

    has(key: Key): boolean {
        return this.store.has(key)
    }

    size(): number {
        return this.store.size
    }

    delete(key: Key): void {
        this.store.delete(key)
    }

    toArray(): [Key, Val][] {
        return Array.from(this.store.entries())
    }

    toObject(): Record<string, any> {
        const obj: Record<string, any> = {}
        for (const [key, value] of this.store.entries()) {
            if (typeof key === 'string' || typeof key === 'number' || typeof key === 'symbol') {
                obj[String(key)] = value
            }
        }
        return obj
    }

    clear(): void {
        this.store.clear()
    }
}
