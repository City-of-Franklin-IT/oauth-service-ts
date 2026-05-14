class StateCache {
    cache = new Map();
    constructor() {
        setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    }
    set(state, entry) {
        this.cache.set(state, entry);
    }
    get(state) {
        const entry = this.cache.get(state);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt < Date.now()) {
            this.cache.delete(state);
            return undefined;
        }
        return entry;
    }
    remove(state) {
        this.cache.delete(state);
    }
    purgeExpired() {
        const now = Date.now();
        for (const [state, entry] of this.cache.entries()) {
            if (entry.expiresAt < now) {
                this.cache.delete(state);
            }
        }
    }
}
export const stateCache = new StateCache();
