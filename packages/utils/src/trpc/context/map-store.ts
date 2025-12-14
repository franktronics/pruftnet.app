import { Store } from './context'

export class MapStore<Key extends string, Val> extends Store<Key, Val> {
    private store: Map<Key, Val> = new Map()

    get(key: Key): Val | undefined {
        return this.store.get(key)
    }

    set(key: Key, value: Val): void {
        this.store.set(key, value)
    }

    has(key: Key): boolean {
        return this.store.has(key)
    }

    delete(key: Key): void {
        this.store.delete(key)
    }

    clear(): void {
        this.store.clear()
    }
}
